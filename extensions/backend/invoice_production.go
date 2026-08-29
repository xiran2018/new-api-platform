package platform

import (
	"errors"
	"fmt"
	stdhtml "html"
	"io"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	xhtml "golang.org/x/net/html"
	"gorm.io/gorm"
)

const (
	invoiceStatusPending    = "pending"
	invoiceStatusProcessing = "processing"
	invoiceStatusCompleted  = "completed"
	invoiceStatusRejected   = "rejected"
	maxRichTextBytes        = 8 << 20
)

type invoiceAuditLog struct {
	ID         uint64    `gorm:"primaryKey" json:"id"`
	EntityType string    `gorm:"size:40;index;not null" json:"entityType"`
	EntityID   uint64    `gorm:"index;not null" json:"entityId"`
	Action     string    `gorm:"size:40;index;not null" json:"action"`
	OldStatus  string    `gorm:"size:32" json:"oldStatus"`
	NewStatus  string    `gorm:"size:32" json:"newStatus"`
	ActorID    int       `gorm:"index;not null" json:"actorId"`
	ActorRole  int       `gorm:"not null" json:"actorRole"`
	ActorName  string    `gorm:"size:100" json:"actorName"`
	IPAddress  string    `gorm:"size:64" json:"ipAddress"`
	Note       string    `gorm:"type:text" json:"note"`
	CreatedAt  time.Time `gorm:"index;not null" json:"createdAt"`
}

type platformFileVersion struct {
	ID         uint64    `gorm:"primaryKey" json:"id"`
	EntityType string    `gorm:"size:40;uniqueIndex:idx_file_version;index;not null" json:"entityType"`
	EntityID   uint64    `gorm:"uniqueIndex:idx_file_version;index;not null" json:"entityId"`
	Version    int       `gorm:"uniqueIndex:idx_file_version;not null" json:"version"`
	FileID     uint64    `gorm:"index;not null" json:"fileId"`
	UploadedBy int       `gorm:"index;not null" json:"uploadedBy"`
	CreatedAt  time.Time `gorm:"not null" json:"createdAt"`
}

func moneyToCents(value float64) int64 { return int64(math.Round(value * 100)) }
func centsToMoney(value int64) float64 { return float64(value) / 100 }

func backfillInvoiceMoney(db *gorm.DB) error {
	statements := []string{
		"UPDATE invoice_requests SET amount_cents = ROUND(amount * 100) WHERE amount_cents = 0 AND amount <> 0",
		"UPDATE invoice_request_orders SET amount_cents = ROUND(amount * 100) WHERE amount_cents = 0 AND amount <> 0",
		"UPDATE reimbursement_requests SET amount_cents = ROUND(amount * 100) WHERE amount_cents = 0 AND amount <> 0",
	}
	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}
	return nil
}

func writeInvoiceAudit(tx *gorm.DB, c *gin.Context, entityType string, entityID uint64, action, oldStatus, newStatus, note string) error {
	return tx.Create(&invoiceAuditLog{EntityType: entityType, EntityID: entityID, Action: action, OldStatus: oldStatus, NewStatus: newStatus, ActorID: c.GetInt("id"), ActorRole: c.GetInt("role"), ActorName: c.GetString("username"), IPAddress: c.ClientIP(), Note: strings.TrimSpace(note), CreatedAt: time.Now()}).Error
}

func saveFileVersion(tx *gorm.DB, c *gin.Context, entityType string, entityID, fileID uint64) error {
	var latest int
	if err := tx.Model(&platformFileVersion{}).Where("entity_type = ? AND entity_id = ?", entityType, entityID).Select("COALESCE(MAX(version), 0)").Scan(&latest).Error; err != nil {
		return err
	}
	return tx.Create(&platformFileVersion{EntityType: entityType, EntityID: entityID, Version: latest + 1, FileID: fileID, UploadedBy: c.GetInt("id"), CreatedAt: time.Now()}).Error
}

func parsePage(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func applyAdminRequestFilters(query *gorm.DB, c *gin.Context, userColumn string) *gorm.DB {
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		query = query.Where("status = ?", status)
	}
	if userID, err := strconv.Atoi(c.Query("userId")); err == nil && userID > 0 {
		query = query.Where(userColumn+" = ?", userID)
	}
	if start := strings.TrimSpace(c.Query("start")); start != "" {
		if parsed, err := time.Parse("2006-01-02", start); err == nil {
			query = query.Where("requested_at >= ?", parsed)
		}
	}
	if end := strings.TrimSpace(c.Query("end")); end != "" {
		if parsed, err := time.Parse("2006-01-02", end); err == nil {
			query = query.Where("requested_at < ?", parsed.AddDate(0, 0, 1))
		}
	}
	return query
}

func validTransition(oldStatus, newStatus string, hasFile bool) bool {
	if oldStatus == newStatus {
		return true
	}
	switch oldStatus {
	case invoiceStatusPending:
		return newStatus == invoiceStatusProcessing || newStatus == invoiceStatusRejected
	case invoiceStatusProcessing:
		return newStatus == invoiceStatusPending || newStatus == invoiceStatusRejected || (newStatus == invoiceStatusCompleted && hasFile)
	case invoiceStatusRejected:
		return newStatus == invoiceStatusPending
	case invoiceStatusCompleted:
		return newStatus == invoiceStatusProcessing
	}
	return false
}

func updateInvoiceRequestStatus(c *gin.Context) { updateRequestStatus(c, true) }
func updateReimbursementStatus(c *gin.Context)  { updateRequestStatus(c, false) }

func updateRequestStatus(c *gin.Context, invoice bool) {
	var input struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		apiError(c, 400, err)
		return
	}
	input.Status, input.Note = strings.TrimSpace(input.Status), strings.TrimSpace(input.Note)
	if input.Status == invoiceStatusCompleted {
		apiError(c, 400, errors.New("upload a file to complete the request"))
		return
	}
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	entityType := "reimbursement"
	err = db.Transaction(func(tx *gorm.DB) error {
		var id uint64
		if _, err := fmt.Sscan(c.Param("id"), &id); err != nil {
			return err
		}
		oldStatus := ""
		hasFile := false
		if invoice {
			entityType = "invoice_request"
			var row invoiceRequest
			if err := tx.First(&row, id).Error; err != nil {
				return err
			}
			oldStatus, hasFile = row.Status, row.FileID != nil
		} else {
			var row reimbursementRequest
			if err := tx.First(&row, id).Error; err != nil {
				return err
			}
			oldStatus, hasFile = row.Status, row.FileID != nil
		}
		if !validTransition(oldStatus, input.Status, hasFile) {
			return errors.New("invalid status transition")
		}
		updates := map[string]any{"status": input.Status, "admin_note": input.Note}
		if input.Status != invoiceStatusCompleted {
			updates["completed_at"] = nil
		}
		var result *gorm.DB
		if invoice {
			result = tx.Model(&invoiceRequest{}).Where("id = ? AND status = ?", id, oldStatus).Updates(updates)
		} else {
			result = tx.Model(&reimbursementRequest{}).Where("id = ? AND status = ?", id, oldStatus).Updates(updates)
		}
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("request was updated concurrently")
		}
		return writeInvoiceAudit(tx, c, entityType, id, "status_changed", oldStatus, input.Status, input.Note)
	})
	if err != nil {
		apiError(c, 409, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func listInvoiceAuditLogs(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	page, pageSize := parsePage(c)
	query := db.Model(&invoiceAuditLog{})
	if entityType := strings.TrimSpace(c.Query("entityType")); entityType != "" {
		query = query.Where("entity_type = ?", entityType)
	}
	if entityID, err := strconv.ParseUint(c.Query("entityId"), 10, 64); err == nil && entityID > 0 {
		query = query.Where("entity_id = ?", entityID)
	}
	var total int64
	if err = query.Count(&total).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	rows := make([]invoiceAuditLog, 0)
	if err = query.Order("id desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": rows, "pagination": gin.H{"page": page, "pageSize": pageSize, "total": total}})
}

var allowedRichTags = map[string]bool{"p": true, "div": true, "span": true, "strong": true, "b": true, "em": true, "i": true, "s": true, "u": true, "h1": true, "h2": true, "h3": true, "ul": true, "ol": true, "li": true, "blockquote": true, "pre": true, "code": true, "a": true, "figure": true, "img": true, "br": true, "hr": true}

func sanitizeRichHTML(input string) (string, error) {
	if len(input) > maxRichTextBytes {
		return "", errors.New("rich text content exceeds 8 MB")
	}
	tokenizer := xhtml.NewTokenizer(strings.NewReader(input))
	var output strings.Builder
	for {
		typeToken := tokenizer.Next()
		if typeToken == xhtml.ErrorToken {
			if errors.Is(tokenizer.Err(), io.EOF) {
				return output.String(), nil
			}
			return "", tokenizer.Err()
		}
		token := tokenizer.Token()
		tag := strings.ToLower(token.Data)
		if typeToken == xhtml.TextToken {
			output.WriteString(stdhtml.EscapeString(token.Data))
			continue
		}
		if !allowedRichTags[tag] {
			continue
		}
		switch typeToken {
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			output.WriteByte('<')
			output.WriteString(tag)
			for _, attr := range token.Attr {
				if name, value, ok := safeRichAttribute(tag, strings.ToLower(attr.Key), attr.Val); ok {
					output.WriteByte(' ')
					output.WriteString(name)
					output.WriteString(`="`)
					output.WriteString(stdhtml.EscapeString(value))
					output.WriteByte('"')
				}
			}
			if typeToken == xhtml.SelfClosingTagToken {
				output.WriteString(" />")
			} else {
				output.WriteByte('>')
			}
		case xhtml.EndTagToken:
			output.WriteString("</")
			output.WriteString(tag)
			output.WriteByte('>')
		}
	}
}

func safeRichAttribute(tag, name, value string) (string, string, bool) {
	value = strings.TrimSpace(value)
	if tag == "a" && name == "href" {
		parsed, err := url.Parse(value)
		if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "mailto") {
			return name, value, true
		}
	}
	if tag == "a" && name == "target" && (value == "_blank" || value == "_self") {
		return name, value, true
	}
	if tag == "img" && name == "src" {
		if strings.HasPrefix(value, "data:image/png;base64,") || strings.HasPrefix(value, "data:image/jpeg;base64,") || strings.HasPrefix(value, "data:image/webp;base64,") {
			return name, value, true
		}
		if parsed, err := url.Parse(value); err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") {
			return name, value, true
		}
	}
	if tag == "img" && name == "alt" {
		return name, value, true
	}
	if tag == "figure" && name == "data-rich-image" && value == "true" {
		return name, value, true
	}
	if tag == "figure" && name == "data-alignment" && (value == "left" || value == "center" || value == "right") {
		return name, value, true
	}
	if name == "style" {
		safe := sanitizeStyle(value)
		if safe != "" {
			return name, safe, true
		}
	}
	return "", "", false
}

func sanitizeStyle(value string) string {
	allowed := map[string]bool{"text-align": true, "font-size": true, "color": true, "display": true, "max-width": true, "height": true, "margin": true}
	parts := make([]string, 0)
	for _, declaration := range strings.Split(value, ";") {
		pair := strings.SplitN(declaration, ":", 2)
		if len(pair) != 2 {
			continue
		}
		key, val := strings.TrimSpace(strings.ToLower(pair[0])), strings.TrimSpace(pair[1])
		if allowed[key] && !strings.ContainsAny(strings.ToLower(val), "<>()\\") {
			parts = append(parts, key+": "+val)
		}
	}
	return strings.Join(parts, "; ")
}
