package platform

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type updateEntry struct {
	ID          uint64    `gorm:"primaryKey" json:"id"`
	Title       string    `gorm:"size:255;not null" json:"title"`
	Icon        string    `gorm:"size:32" json:"icon"`
	BodyHTML    string    `gorm:"type:text;not null" json:"bodyHtml"`
	Published   bool      `json:"published"`
	SortOrder   int       `json:"sortOrder"`
	PublishedAt time.Time `json:"publishedAt"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type platformSetting struct {
	Key   string `gorm:"primaryKey;size:100"`
	Value string `gorm:"type:text;not null"`
}

type faqCategory struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:120;not null" json:"name"`
	SortOrder int       `json:"sortOrder"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type faqItem struct {
	ID         uint64    `gorm:"primaryKey" json:"id"`
	CategoryID uint64    `gorm:"index;not null" json:"categoryId"`
	Title      string    `gorm:"size:255;not null" json:"title"`
	BodyHTML   string    `gorm:"type:text;not null" json:"bodyHtml"`
	Published  bool      `json:"published"`
	SortOrder  int       `json:"sortOrder"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

var platformDB *gorm.DB
var platformDBOnce sync.Once
var platformDBErr error

func platformDatabase() (*gorm.DB, error) {
	platformDBOnce.Do(func() {
		dsn := os.Getenv("PLATFORM_DATABASE_URL")
		if dsn == "" {
			dsn = "postgresql://root:123456@localhost:5432/platform_db?sslmode=disable"
		}
		platformDB, platformDBErr = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if platformDBErr != nil {
			platformDBErr = createPlatformDatabase(dsn)
			if platformDBErr == nil {
				platformDB, platformDBErr = gorm.Open(postgres.Open(dsn), &gorm.Config{})
			}
		}
		if platformDBErr != nil {
			return
		}
		platformDBErr = platformDB.AutoMigrate(&updateEntry{}, &platformSetting{}, &faqCategory{}, &faqItem{}, &modelPriceCatalog{}, &invoiceProfile{}, &platformFile{}, &invoiceRequest{}, &invoiceRequestOrder{}, &reimbursementRequest{}, &invoiceSample{}, &invoiceAuditLog{}, &platformFileVersion{})
		if platformDBErr == nil {
			platformDBErr = backfillInvoiceMoney(platformDB)
		}
		if platformDBErr == nil {
			platformDBErr = platformDB.Where(platformSetting{Key: "updates_enabled"}).FirstOrCreate(&platformSetting{Key: "updates_enabled", Value: "true"}).Error
		}
	})
	return platformDB, platformDBErr
}

// createPlatformDatabase creates only the database named in PLATFORM_DATABASE_URL.
// It never opens or migrates new-api's database.
func createPlatformDatabase(dsn string) error {
	u, err := url.Parse(dsn)
	if err != nil {
		return err
	}
	databaseName := strings.TrimPrefix(u.Path, "/")
	if databaseName == "" || databaseName == "postgres" {
		return errors.New("PLATFORM_DATABASE_URL must name a non-core database")
	}
	u.Path = "/postgres"
	adminDB, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		return err
	}
	sqlDB, err := adminDB.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	if err = adminDB.Exec(`CREATE DATABASE "` + strings.ReplaceAll(databaseName, `"`, ``) + `"`).Error; err != nil && !strings.Contains(err.Error(), "already exists") {
		return err
	}
	return nil
}

// RegisterRoutes mounts platform APIs without changing the upstream API tree.
func RegisterRoutes(apiRouter *gin.RouterGroup) {
	publicRouter := apiRouter.Group("/platform/public")
	publicRouter.GET("/updates", getPublicUpdates)
	publicRouter.GET("/updates/settings", getPublicUpdateSettings)
	publicRouter.GET("/faq", getPublicFAQ)
	publicRouter.GET("/model-prices", getPublicModelPrices)
	registerInvoiceRoutes(apiRouter)

	adminRouter := apiRouter.Group("/platform/admin")
	adminRouter.Use(middleware.AdminAuth())
	adminRouter.GET("/content", listContent)
	adminRouter.GET("/updates", listUpdates)
	adminRouter.POST("/updates", createUpdate)
	adminRouter.PUT("/updates/:id", updateUpdate)
	adminRouter.DELETE("/updates/:id", deleteUpdate)
	adminRouter.GET("/updates/settings", getUpdateSettings)
	adminRouter.PUT("/updates/settings", saveUpdateSettings)
	adminRouter.GET("/faq/categories", listFAQCategories)
	adminRouter.POST("/faq/categories", saveFAQCategory)
	adminRouter.PUT("/faq/categories/:id", saveFAQCategory)
	adminRouter.DELETE("/faq/categories/:id", deleteFAQCategory)
	adminRouter.GET("/faq/items", listFAQItems)
	adminRouter.POST("/faq/items", saveFAQItem)
	adminRouter.PUT("/faq/items/:id", saveFAQItem)
	adminRouter.DELETE("/faq/items/:id", deleteFAQItem)
	registerModelPriceRoutes(adminRouter)
}

func getPublicFAQ(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var categories []faqCategory
	_ = db.Order("sort_order asc, id asc").Find(&categories).Error
	var items []faqItem
	query := strings.TrimSpace(c.Query("q"))
	itemQuery := db.Where("published = ?", true)
	if query != "" {
		itemQuery = itemQuery.Where("title ILIKE ? OR body_html ILIKE ?", "%"+query+"%", "%"+query+"%")
	}
	_ = itemQuery.Order("sort_order asc, id asc").Find(&items).Error
	c.JSON(200, gin.H{"success": true, "data": gin.H{"categories": categories, "items": items}})
}

func listFAQCategories(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false})
		return
	}
	var rows []faqCategory
	err = db.Order("sort_order asc, id asc").Find(&rows).Error
	c.JSON(200, gin.H{"success": err == nil, "data": rows})
}
func saveFAQCategory(c *gin.Context) {
	var row faqCategory
	if err := c.ShouldBindJSON(&row); err != nil || strings.TrimSpace(row.Name) == "" {
		c.JSON(400, gin.H{"success": false, "message": "category name is required"})
		return
	}
	db, err := platformDatabase()
	if err == nil {
		if c.Param("id") != "" {
			var id uint64
			_, _ = fmt.Sscan(c.Param("id"), &id)
			err = db.Model(&faqCategory{}).Where("id = ?", id).Updates(map[string]any{"name": row.Name, "sort_order": row.SortOrder}).Error
		} else {
			err = db.Create(&row).Error
		}
	}
	c.JSON(200, gin.H{"success": err == nil, "data": row})
}
func deleteFAQCategory(c *gin.Context) {
	var id uint64
	_, _ = fmt.Sscan(c.Param("id"), &id)
	db, err := platformDatabase()
	if err == nil {
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("category_id = ?", id).Delete(&faqItem{}).Error; err != nil {
				return err
			}
			return tx.Delete(&faqCategory{}, id).Error
		})
	}
	c.JSON(200, gin.H{"success": err == nil})
}
func listFAQItems(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false})
		return
	}
	var rows []faqItem
	q := strings.TrimSpace(c.Query("q"))
	query := db
	if q != "" {
		query = query.Where("title ILIKE ? OR body_html ILIKE ?", "%"+q+"%", "%"+q+"%")
	}
	err = query.Order("sort_order asc, id asc").Find(&rows).Error
	c.JSON(200, gin.H{"success": err == nil, "data": rows})
}
func saveFAQItem(c *gin.Context) {
	var row faqItem
	if err := c.ShouldBindJSON(&row); err != nil || row.CategoryID == 0 || strings.TrimSpace(row.Title) == "" || strings.TrimSpace(row.BodyHTML) == "" {
		c.JSON(400, gin.H{"success": false, "message": "category, title and content are required"})
		return
	}
	cleanBody, cleanErr := sanitizeRichHTML(row.BodyHTML)
	if cleanErr != nil {
		c.JSON(400, gin.H{"success": false, "message": cleanErr.Error()})
		return
	}
	row.BodyHTML = cleanBody
	db, err := platformDatabase()
	if err == nil {
		if c.Param("id") != "" {
			var id uint64
			_, _ = fmt.Sscan(c.Param("id"), &id)
			err = db.Model(&faqItem{}).Where("id = ?", id).Updates(map[string]any{"category_id": row.CategoryID, "title": row.Title, "body_html": row.BodyHTML, "published": row.Published, "sort_order": row.SortOrder}).Error
		} else {
			err = db.Create(&row).Error
		}
	}
	c.JSON(200, gin.H{"success": err == nil, "data": row})
}
func deleteFAQItem(c *gin.Context) {
	var id uint64
	_, _ = fmt.Sscan(c.Param("id"), &id)
	db, err := platformDatabase()
	if err == nil {
		err = db.Delete(&faqItem{}, id).Error
	}
	c.JSON(200, gin.H{"success": err == nil})
}

func listContent(c *gin.Context) {
	c.JSON(200, gin.H{"success": true, "data": []any{}})
}

func getPublicUpdates(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var setting platformSetting
	if err = db.First(&setting, "key = ?", "updates_enabled").Error; err != nil || setting.Value != "true" {
		c.JSON(404, gin.H{"success": false})
		return
	}
	var items []updateEntry
	if err = db.Where("published = ?", true).Order("published_at desc, sort_order asc").Find(&items).Error; err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": items})
}

func getPublicUpdateSettings(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var setting platformSetting
	if err = db.First(&setting, "key = ?", "updates_enabled").Error; err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"enabled": setting.Value == "true"}})
}

func listUpdates(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var items []updateEntry
	if err = db.Order("published_at desc, sort_order asc").Find(&items).Error; err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": items})
}

func decodeUpdate(c *gin.Context) (updateEntry, error) {
	var item updateEntry
	if err := c.ShouldBindJSON(&item); err != nil {
		return item, err
	}
	item.Title = strings.TrimSpace(item.Title)
	if item.Title == "" || strings.TrimSpace(item.BodyHTML) == "" {
		return item, errors.New("title and rich text content are required")
	}
	cleanBody, err := sanitizeRichHTML(item.BodyHTML)
	if err != nil {
		return item, err
	}
	item.BodyHTML = cleanBody
	if item.PublishedAt.IsZero() {
		item.PublishedAt = time.Now()
	}
	return item, nil
}

func createUpdate(c *gin.Context) {
	item, err := decodeUpdate(c)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Create(&item).Error
	}
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": item})
}

func updateUpdate(c *gin.Context) {
	var id uint64
	if _, err := fmt.Sscan(c.Param("id"), &id); err != nil {
		c.JSON(400, gin.H{"success": false})
		return
	}
	item, err := decodeUpdate(c)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Model(&updateEntry{}).Where("id = ?", id).Updates(map[string]any{"title": item.Title, "icon": item.Icon, "body_html": item.BodyHTML, "published": item.Published, "sort_order": item.SortOrder, "published_at": item.PublishedAt}).Error
	}
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func deleteUpdate(c *gin.Context) {
	var id uint64
	if _, err := fmt.Sscan(c.Param("id"), &id); err != nil {
		c.JSON(400, gin.H{"success": false})
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Delete(&updateEntry{}, id).Error
	}
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func getUpdateSettings(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var setting platformSetting
	_ = db.First(&setting, "key = ?", "updates_enabled").Error
	c.JSON(200, gin.H{"success": true, "data": gin.H{"enabled": setting.Value == "true"}})
}

func saveUpdateSettings(c *gin.Context) {
	var input struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"success": false})
		return
	}
	db, err := platformDatabase()
	if err == nil {
		err = db.Save(&platformSetting{Key: "updates_enabled", Value: fmt.Sprint(input.Enabled)}).Error
	}
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}
