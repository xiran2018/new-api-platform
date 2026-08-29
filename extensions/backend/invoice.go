package platform

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const maxPlatformUploadSize = 12 << 20

type invoiceProfile struct {
	ID          uint64    `gorm:"primaryKey" json:"id"`
	UserID      int       `gorm:"uniqueIndex;not null" json:"userId"`
	Title       string    `gorm:"size:255;not null" json:"title"`
	TaxNumber   string    `gorm:"size:100;not null" json:"taxNumber"`
	InvoiceType string    `gorm:"size:32;not null" json:"invoiceType"`
	Emails      string    `gorm:"type:text;not null" json:"emails"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type platformFile struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	MimeType  string    `gorm:"size:120;not null" json:"mimeType"`
	Size      int64     `gorm:"not null" json:"size"`
	Data      []byte    `gorm:"type:bytea;not null" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

type invoiceRequest struct {
	ID           uint64     `gorm:"primaryKey" json:"id"`
	UserID       int        `gorm:"index;not null" json:"userId"`
	ProfileTitle string     `gorm:"size:255;not null" json:"profileTitle"`
	TaxNumber    string     `gorm:"size:100;not null" json:"taxNumber"`
	InvoiceType  string     `gorm:"size:32;not null" json:"invoiceType"`
	Emails       string     `gorm:"type:text;not null" json:"emails"`
	Amount       float64    `gorm:"not null" json:"amount"`
	Status       string     `gorm:"size:32;index;not null" json:"status"`
	FileID       *uint64    `json:"fileId"`
	AdminNote    string     `gorm:"type:text" json:"adminNote"`
	RequestedAt  time.Time  `gorm:"index;not null" json:"requestedAt"`
	CompletedAt  *time.Time `json:"completedAt"`
}

type invoiceRequestOrder struct {
	ID        uint64  `gorm:"primaryKey" json:"id"`
	RequestID uint64  `gorm:"index;not null" json:"requestId"`
	TopUpID   int     `gorm:"uniqueIndex;not null" json:"topUpId"`
	TradeNo   string  `gorm:"size:255;not null" json:"tradeNo"`
	Amount    float64 `gorm:"not null" json:"amount"`
}

type reimbursementRequest struct {
	ID          uint64     `gorm:"primaryKey" json:"id"`
	UserID      int        `gorm:"index;not null" json:"userId"`
	Title       string     `gorm:"size:255;not null" json:"title"`
	Amount      float64    `gorm:"not null" json:"amount"`
	Email       string     `gorm:"size:255;not null" json:"email"`
	Note        string     `gorm:"type:text" json:"note"`
	Status      string     `gorm:"size:32;index;not null" json:"status"`
	FileID      *uint64    `json:"fileId"`
	AdminNote   string     `gorm:"type:text" json:"adminNote"`
	RequestedAt time.Time  `json:"requestedAt"`
	CompletedAt *time.Time `json:"completedAt"`
}

type invoiceSample struct {
	ID          uint64    `gorm:"primaryKey" json:"id"`
	Title       string    `gorm:"size:255;not null" json:"title"`
	Description string    `gorm:"type:text" json:"description"`
	FileID      *uint64   `json:"fileId"`
	Published   bool      `json:"published"`
	SortOrder   int       `json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func registerInvoiceRoutes(api *gin.RouterGroup) {
	user := api.Group("/platform/user/invoice")
	user.Use(middleware.UserAuth())
	user.GET("/profile", getInvoiceProfile)
	user.PUT("/profile", saveInvoiceProfile)
	user.GET("/orders", listInvoiceOrders)
	user.POST("/requests", createInvoiceRequest)
	user.GET("/requests/:id/file", downloadUserInvoice)
	user.GET("/reimbursements", listUserReimbursements)
	user.POST("/reimbursements", createReimbursement)
	user.GET("/reimbursements/:id/file", downloadUserReimbursement)
	user.GET("/billing", getUserBilling)
	user.GET("/content", getInvoiceContent)
	user.GET("/samples/:id/file", downloadPublishedSample)

	admin := api.Group("/platform/admin/invoice")
	admin.Use(middleware.AdminAuth())
	admin.GET("/requests", listAdminInvoiceRequests)
	admin.GET("/requests/:id", getAdminInvoiceRequestDetail)
	admin.POST("/requests/:id/upload", uploadInvoice)
	admin.GET("/requests/:id/file", downloadAdminInvoice)
	admin.GET("/reimbursements", listAdminReimbursements)
	admin.POST("/reimbursements/:id/upload", uploadReimbursement)
	admin.GET("/reimbursements/:id/file", downloadAdminReimbursement)
	admin.GET("/content", getInvoiceAdminContent)
	admin.PUT("/content", saveInvoiceContent)
	admin.POST("/samples", createInvoiceSample)
	admin.PUT("/samples/:id", updateInvoiceSample)
	admin.POST("/samples/:id/upload", uploadInvoiceSample)
	admin.GET("/samples/:id/file", downloadAdminSample)
	admin.DELETE("/samples/:id", deleteInvoiceSample)
}

func apiError(c *gin.Context, status int, err error) {
	c.JSON(status, gin.H{"success": false, "message": err.Error()})
}
func getInvoiceProfile(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var row invoiceProfile
	err = db.Where("user_id = ?", c.GetInt("id")).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(200, gin.H{"success": true, "data": nil})
		return
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": row})
}

func saveInvoiceProfile(c *gin.Context) {
	var in invoiceProfile
	if err := c.ShouldBindJSON(&in); err != nil {
		apiError(c, 400, err)
		return
	}
	in.Title, in.TaxNumber, in.InvoiceType, in.Emails = strings.TrimSpace(in.Title), strings.TrimSpace(in.TaxNumber), strings.TrimSpace(in.InvoiceType), strings.TrimSpace(in.Emails)
	if in.Title == "" || in.TaxNumber == "" || in.Emails == "" || (in.InvoiceType != "normal" && in.InvoiceType != "vat") {
		apiError(c, 400, errors.New("invalid invoice information"))
		return
	}
	in.UserID = c.GetInt("id")
	db, err := platformDatabase()
	if err == nil {
		err = db.Where(invoiceProfile{UserID: in.UserID}).Assign(map[string]any{"title": in.Title, "tax_number": in.TaxNumber, "invoice_type": in.InvoiceType, "emails": in.Emails}).FirstOrCreate(&in).Error
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": in})
}

type invoiceOrderView struct {
	ID                 int        `json:"id"`
	TradeNo            string     `json:"tradeNo"`
	Type               string     `json:"type"`
	Amount             float64    `json:"amount"`
	CreateTime         int64      `json:"createTime"`
	CompleteTime       int64      `json:"completeTime"`
	Status             string     `json:"status"`
	InvoiceStatus      string     `json:"invoiceStatus"`
	InvoiceRequestID   *uint64    `json:"invoiceRequestId"`
	RequestedAt        *time.Time `json:"requestedAt"`
	InvoiceCompletedAt *time.Time `json:"invoiceCompletedAt"`
	Downloadable       bool       `json:"downloadable"`
}

func listInvoiceOrders(c *gin.Context) {
	var rows []model.TopUp
	query := model.DB.Where("user_id = ?", c.GetInt("id"))
	if v := strings.TrimSpace(c.Query("type")); v != "" {
		query = query.Where("payment_method = ?", v)
	}
	if v := strings.TrimSpace(c.Query("status")); v != "" {
		query = query.Where("status = ?", v)
	}
	if err := query.Order("create_time desc, id desc").Limit(500).Find(&rows).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var links []struct {
		TopUpID     int
		RequestID   uint64
		Status      string
		RequestedAt time.Time
		CompletedAt *time.Time
		FileID      *uint64
	}
	db.Table("invoice_request_orders iro").Select("iro.top_up_id, ir.id request_id, ir.status, ir.requested_at, ir.completed_at, ir.file_id").Joins("JOIN invoice_requests ir ON ir.id = iro.request_id").Where("ir.user_id = ?", c.GetInt("id")).Scan(&links)
	byID := map[int]struct {
		RequestID   uint64
		Status      string
		RequestedAt time.Time
		CompletedAt *time.Time
		FileID      *uint64
	}{}
	for _, link := range links {
		byID[link.TopUpID] = struct {
			RequestID   uint64
			Status      string
			RequestedAt time.Time
			CompletedAt *time.Time
			FileID      *uint64
		}{link.RequestID, link.Status, link.RequestedAt, link.CompletedAt, link.FileID}
	}
	out := make([]invoiceOrderView, 0, len(rows))
	for _, row := range rows {
		view := invoiceOrderView{ID: row.Id, TradeNo: row.TradeNo, Type: row.PaymentMethod, Amount: row.Money, CreateTime: row.CreateTime, CompleteTime: row.CompleteTime, Status: row.Status, InvoiceStatus: "not_requested"}
		if link, ok := byID[row.Id]; ok {
			view.InvoiceStatus, view.InvoiceRequestID, view.RequestedAt, view.InvoiceCompletedAt, view.Downloadable = link.Status, &link.RequestID, &link.RequestedAt, link.CompletedAt, link.FileID != nil
		}
		out = append(out, view)
	}
	c.JSON(200, gin.H{"success": true, "data": out})
}

func createInvoiceRequest(c *gin.Context) {
	var in struct {
		OrderIDs []int `json:"orderIds"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || len(in.OrderIDs) == 0 || len(in.OrderIDs) > 100 {
		apiError(c, 400, errors.New("select 1 to 100 orders"))
		return
	}
	unique := map[int]bool{}
	for _, id := range in.OrderIDs {
		if id <= 0 || unique[id] {
			apiError(c, 400, errors.New("invalid or duplicate order"))
			return
		}
		unique[id] = true
	}
	var profile invoiceProfile
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	if err = db.Where("user_id = ?", c.GetInt("id")).First(&profile).Error; err != nil {
		apiError(c, 400, errors.New("save invoice information first"))
		return
	}
	var orders []model.TopUp
	if err = model.DB.Where("id IN ? AND user_id = ? AND status = ?", in.OrderIDs, c.GetInt("id"), common.TopUpStatusSuccess).Find(&orders).Error; err != nil || len(orders) != len(in.OrderIDs) {
		apiError(c, 400, errors.New("orders must belong to the current user and be completed"))
		return
	}
	request := invoiceRequest{UserID: c.GetInt("id"), ProfileTitle: profile.Title, TaxNumber: profile.TaxNumber, InvoiceType: profile.InvoiceType, Emails: profile.Emails, Status: "pending", RequestedAt: time.Now()}
	for _, order := range orders {
		request.Amount += order.Money
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&invoiceRequestOrder{}).Where("top_up_id IN ?", in.OrderIDs).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return errors.New("one or more orders already have an invoice request")
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}
		links := make([]invoiceRequestOrder, 0, len(orders))
		for _, order := range orders {
			links = append(links, invoiceRequestOrder{RequestID: request.ID, TopUpID: order.Id, TradeNo: order.TradeNo, Amount: order.Money})
		}
		return tx.Create(&links).Error
	})
	if err != nil {
		apiError(c, 409, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": request})
}

func listUserReimbursements(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var rows []reimbursementRequest
	err = db.Where("user_id = ?", c.GetInt("id")).Order("id desc").Find(&rows).Error
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": rows})
}
func createReimbursement(c *gin.Context) {
	var row reimbursementRequest
	if err := c.ShouldBindJSON(&row); err != nil {
		apiError(c, 400, err)
		return
	}
	row.Title, row.Email, row.Note = strings.TrimSpace(row.Title), strings.TrimSpace(row.Email), strings.TrimSpace(row.Note)
	if row.Title == "" || row.Email == "" || row.Amount <= 0 {
		apiError(c, 400, errors.New("title, positive amount and email are required"))
		return
	}
	row.ID, row.UserID, row.Status, row.RequestedAt, row.FileID = 0, c.GetInt("id"), "pending", time.Now(), nil
	db, err := platformDatabase()
	if err == nil {
		err = db.Create(&row).Error
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": row})
}

type billingRow struct {
	Key          string  `json:"key"`
	RequestCount int64   `json:"requestCount"`
	Tokens       int64   `json:"tokens"`
	Quota        int64   `json:"quota"`
	Cost         float64 `json:"cost"`
}

func getUserBilling(c *gin.Context) {
	now := time.Now()
	start := now.AddDate(0, 0, -30)
	end := now
	if value := c.Query("start"); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			apiError(c, 400, errors.New("invalid start date"))
			return
		}
		start = parsed
	}
	if value := c.Query("end"); value != "" {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			apiError(c, 400, errors.New("invalid end date"))
			return
		}
		end = parsed.Add(24*time.Hour - time.Second)
	}
	if end.Before(start) || end.Sub(start) > 366*24*time.Hour {
		apiError(c, 400, errors.New("date range must be within 366 days"))
		return
	}
	models := make([]billingRow, 0)
	if err := model.DB.Table("quota_data").Where("user_id = ? AND created_at >= ? AND created_at <= ?", c.GetInt("id"), start.Unix(), end.Unix()).Select("model_name as key, sum(count) request_count, sum(token_used) tokens, sum(quota) quota").Group("model_name").Order("quota desc").Scan(&models).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	type dailyRaw struct {
		Day          int64
		RequestCount int64
		Tokens       int64
		Quota        int64
	}
	var raw []dailyRaw
	if err := model.DB.Table("quota_data").Where("user_id = ? AND created_at >= ? AND created_at <= ?", c.GetInt("id"), start.Unix(), end.Unix()).Select("(created_at / 86400) * 86400 as day, sum(count) request_count, sum(token_used) tokens, sum(quota) quota").Group("(created_at / 86400) * 86400").Order("day desc").Scan(&raw).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	days := make([]billingRow, 0, len(raw))
	var summary billingRow
	for i := range models {
		models[i].Cost = float64(models[i].Quota) / common.QuotaPerUnit
		summary.RequestCount += models[i].RequestCount
		summary.Tokens += models[i].Tokens
		summary.Quota += models[i].Quota
	}
	summary.Cost = float64(summary.Quota) / common.QuotaPerUnit
	for _, row := range raw {
		days = append(days, billingRow{Key: time.Unix(row.Day, 0).Format("2006-01-02"), RequestCount: row.RequestCount, Tokens: row.Tokens, Quota: row.Quota, Cost: float64(row.Quota) / common.QuotaPerUnit})
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"summary": summary, "models": models, "days": days}})
}

func listAdminInvoiceRequests(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var rows []invoiceRequest
	q := db.Order("id desc")
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if err = q.Find(&rows).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	type adminInvoiceView struct {
		invoiceRequest
		Orders []invoiceRequestOrder `json:"orders"`
	}
	out := make([]adminInvoiceView, 0, len(rows))
	for _, row := range rows {
		var orders []invoiceRequestOrder
		if err := db.Where("request_id = ?", row.ID).Order("id").Find(&orders).Error; err != nil {
			apiError(c, 500, err)
			return
		}
		out = append(out, adminInvoiceView{invoiceRequest: row, Orders: orders})
	}
	c.JSON(200, gin.H{"success": true, "data": out})
}

type adminInvoiceOrderDetail struct {
	ID              int     `json:"id"`
	TradeNo         string  `json:"tradeNo"`
	Type            string  `json:"type"`
	PaymentProvider string  `json:"paymentProvider"`
	Amount          float64 `json:"amount"`
	CreateTime      int64   `json:"createTime"`
	CompleteTime    int64   `json:"completeTime"`
	Status          string  `json:"status"`
}

func getAdminInvoiceRequestDetail(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var request invoiceRequest
	if err = db.First(&request, c.Param("id")).Error; err != nil {
		apiError(c, 404, errors.New("invoice request not found"))
		return
	}
	var links []invoiceRequestOrder
	if err = db.Where("request_id = ?", request.ID).Order("id").Find(&links).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	topUpIDs := make([]int, 0, len(links))
	for _, link := range links {
		topUpIDs = append(topUpIDs, link.TopUpID)
	}
	var topUps []model.TopUp
	if len(topUpIDs) > 0 {
		if err = model.DB.Where("id IN ?", topUpIDs).Order("create_time desc, id desc").Find(&topUps).Error; err != nil {
			apiError(c, 500, err)
			return
		}
	}
	orders := make([]adminInvoiceOrderDetail, 0, len(topUps))
	for _, topUp := range topUps {
		orders = append(orders, adminInvoiceOrderDetail{ID: topUp.Id, TradeNo: topUp.TradeNo, Type: topUp.PaymentMethod, PaymentProvider: topUp.PaymentProvider, Amount: topUp.Money, CreateTime: topUp.CreateTime, CompleteTime: topUp.CompleteTime, Status: topUp.Status})
	}
	username, _ := model.GetUsernameById(request.UserID, true)
	c.JSON(200, gin.H{"success": true, "data": gin.H{"request": request, "username": username, "orders": orders}})
}
func listAdminReimbursements(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var rows []reimbursementRequest
	q := db.Order("id desc")
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if err = q.Find(&rows).Error; err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": rows})
}

func receiveFile(c *gin.Context) (*platformFile, error) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxPlatformUploadSize)
	header, err := c.FormFile("file")
	if err != nil {
		return nil, errors.New("file is required")
	}
	opened, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer opened.Close()
	data, err := io.ReadAll(io.LimitReader(opened, maxPlatformUploadSize+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxPlatformUploadSize {
		return nil, errors.New("file exceeds 12 MB")
	}
	mime := http.DetectContentType(data)
	allowed := mime == "application/pdf" || strings.HasPrefix(mime, "image/")
	if !allowed {
		return nil, errors.New("only PDF and image files are allowed")
	}
	return &platformFile{Name: header.Filename, MimeType: mime, Size: int64(len(data)), Data: data}, nil
}
func uploadInvoice(c *gin.Context)       { uploadRequestFile(c, true) }
func uploadReimbursement(c *gin.Context) { uploadRequestFile(c, false) }
func uploadRequestFile(c *gin.Context, invoice bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		apiError(c, 400, err)
		return
	}
	file, err := receiveFile(c)
	if err != nil {
		apiError(c, 400, err)
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(file).Error; err != nil {
				return err
			}
			now := time.Now()
			var result *gorm.DB
			if invoice {
				result = tx.Model(&invoiceRequest{}).Where("id = ?", id).Updates(map[string]any{"file_id": file.ID, "status": "completed", "completed_at": &now, "admin_note": c.PostForm("note")})
			} else {
				result = tx.Model(&reimbursementRequest{}).Where("id = ?", id).Updates(map[string]any{"file_id": file.ID, "status": "completed", "completed_at": &now, "admin_note": c.PostForm("note")})
			}
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
			return nil
		})
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func sendStoredFile(c *gin.Context, fileID uint64) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var file platformFile
	if err = db.First(&file, fileID).Error; err != nil {
		apiError(c, 404, errors.New("file not found"))
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", strings.ReplaceAll(file.Name, `"`, "")))
	c.Data(200, file.MimeType, file.Data)
}
func downloadUserInvoice(c *gin.Context) {
	var row invoiceRequest
	db, err := platformDatabase()
	if err == nil {
		err = db.Where("id = ? AND user_id = ?", c.Param("id"), c.GetInt("id")).First(&row).Error
	}
	if err != nil || row.FileID == nil {
		apiError(c, 404, errors.New("invoice not found"))
		return
	}
	sendStoredFile(c, *row.FileID)
}
func downloadAdminInvoice(c *gin.Context) {
	var row invoiceRequest
	db, err := platformDatabase()
	if err == nil {
		err = db.First(&row, c.Param("id")).Error
	}
	if err != nil || row.FileID == nil {
		apiError(c, 404, errors.New("invoice not found"))
		return
	}
	sendStoredFile(c, *row.FileID)
}
func downloadUserReimbursement(c *gin.Context) {
	var row reimbursementRequest
	db, err := platformDatabase()
	if err == nil {
		err = db.Where("id = ? AND user_id = ?", c.Param("id"), c.GetInt("id")).First(&row).Error
	}
	if err != nil || row.FileID == nil {
		apiError(c, 404, errors.New("statement not found"))
		return
	}
	sendStoredFile(c, *row.FileID)
}
func downloadAdminReimbursement(c *gin.Context) {
	var row reimbursementRequest
	db, err := platformDatabase()
	if err == nil {
		err = db.First(&row, c.Param("id")).Error
	}
	if err != nil || row.FileID == nil {
		apiError(c, 404, errors.New("statement not found"))
		return
	}
	sendStoredFile(c, *row.FileID)
}

func getInvoiceContent(c *gin.Context) {
	getInvoiceContentWithVisibility(c, true)
}
func getInvoiceAdminContent(c *gin.Context) {
	getInvoiceContentWithVisibility(c, false)
}
func getInvoiceContentWithVisibility(c *gin.Context, publishedOnly bool) {
	db, err := platformDatabase()
	if err != nil {
		apiError(c, 500, err)
		return
	}
	var settings []platformSetting
	_ = db.Where("key IN ?", []string{"invoice_reimbursement_instructions", "invoice_customer_service"}).Find(&settings).Error
	values := map[string]string{}
	for _, s := range settings {
		values[s.Key] = s.Value
	}
	var samples []invoiceSample
	query := db.Order("sort_order, id")
	if publishedOnly {
		query = query.Where("published = ?", true)
	}
	_ = query.Find(&samples).Error
	c.JSON(200, gin.H{"success": true, "data": gin.H{"sampleInstructions": values["invoice_reimbursement_instructions"], "reimbursementInstructions": values["invoice_reimbursement_instructions"], "customerService": values["invoice_customer_service"], "samples": samples}})
}
func saveInvoiceContent(c *gin.Context) {
	var in struct {
		SampleInstructions        string `json:"sampleInstructions"`
		ReimbursementInstructions string `json:"reimbursementInstructions"`
		CustomerService           string `json:"customerService"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		apiError(c, 400, err)
		return
	}
	if in.SampleInstructions != "" || in.ReimbursementInstructions == "" {
		in.ReimbursementInstructions = in.SampleInstructions
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Transaction(func(tx *gorm.DB) error {
			for key, value := range map[string]string{"invoice_reimbursement_instructions": in.ReimbursementInstructions, "invoice_customer_service": in.CustomerService} {
				if e := tx.Save(&platformSetting{Key: key, Value: value}).Error; e != nil {
					return e
				}
			}
			return nil
		})
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}
func createInvoiceSample(c *gin.Context) {
	var row invoiceSample
	if err := c.ShouldBindJSON(&row); err != nil || strings.TrimSpace(row.Title) == "" {
		apiError(c, 400, errors.New("title is required"))
		return
	}
	row.ID = 0
	db, err := platformDatabase()
	if err == nil {
		err = db.Create(&row).Error
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": row})
}
func updateInvoiceSample(c *gin.Context) {
	var row invoiceSample
	if err := c.ShouldBindJSON(&row); err != nil || strings.TrimSpace(row.Title) == "" {
		apiError(c, 400, errors.New("title is required"))
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Model(&invoiceSample{}).Where("id = ?", c.Param("id")).Updates(map[string]any{"title": row.Title, "description": row.Description, "published": row.Published, "sort_order": row.SortOrder}).Error
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}
func uploadInvoiceSample(c *gin.Context) {
	file, err := receiveFile(c)
	if err != nil {
		apiError(c, 400, err)
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(file).Error; err != nil {
				return err
			}
			result := tx.Model(&invoiceSample{}).Where("id = ?", c.Param("id")).Update("file_id", file.ID)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return gorm.ErrRecordNotFound
			}
			return nil
		})
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}
func deleteInvoiceSample(c *gin.Context) {
	db, err := platformDatabase()
	if err == nil {
		err = db.Delete(&invoiceSample{}, c.Param("id")).Error
	}
	if err != nil {
		apiError(c, 500, err)
		return
	}
	c.JSON(200, gin.H{"success": true})
}
func downloadPublishedSample(c *gin.Context) {
	var row invoiceSample
	db, err := platformDatabase()
	if err == nil {
		err = db.Where("id = ? AND published = ?", c.Param("id"), true).First(&row).Error
	}
	if err != nil || row.FileID == nil {
		apiError(c, 404, errors.New("sample not found"))
		return
	}
	sendStoredFile(c, *row.FileID)
}

func downloadAdminSample(c *gin.Context) {
	var row invoiceSample
	db, err := platformDatabase()
	if err == nil {
		err = db.First(&row, c.Param("id")).Error
	}
	if err != nil || row.FileID == nil {
		apiError(c, 404, errors.New("sample not found"))
		return
	}
	sendStoredFile(c, *row.FileID)
}
