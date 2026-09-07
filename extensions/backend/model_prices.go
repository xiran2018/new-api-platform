package platform

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// modelPriceCatalog is a presentation and comparison record. Runtime billing
// remains owned by new-api's existing billing settings.
type modelPriceCatalog struct {
	ID                uint64          `gorm:"primaryKey" json:"id"`
	ModelKey          string          `gorm:"size:255;uniqueIndex;not null" json:"modelKey"`
	DisplayName       string          `gorm:"size:255;not null" json:"displayName"`
	Vendor            string          `gorm:"size:120;index" json:"vendor"`
	Tags              json.RawMessage `gorm:"type:jsonb;not null;default:'[]'" json:"tags"`
	Currency          string          `gorm:"size:8;not null;default:CNY" json:"currency"`
	Timezone          string          `gorm:"size:64;not null;default:Asia/Shanghai" json:"timezone"`
	VendorPriceSpec   json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"vendorPriceSpec"`
	LLMAPIPriceSpec   json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"llmapiPriceSpec"`
	PendingVendorSpec json.RawMessage `gorm:"type:jsonb" json:"pendingVendorSpec"`
	RuntimePricingRef json.RawMessage `gorm:"type:jsonb;not null;default:'{}'" json:"runtimePricingRef"`
	UpstreamSource    string          `gorm:"size:255" json:"upstreamSource"`
	SyncStatus        string          `gorm:"size:24;not null;default:idle" json:"syncStatus"`
	Published         bool            `gorm:"index;not null;default:false" json:"published"`
	SortOrder         int             `gorm:"index;not null;default:0" json:"sortOrder"`
	LastSyncedAt      *time.Time      `json:"lastSyncedAt"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type modelPriceInput struct {
	ModelKey          string          `json:"modelKey"`
	DisplayName       string          `json:"displayName"`
	Vendor            string          `json:"vendor"`
	Tags              json.RawMessage `json:"tags"`
	Currency          string          `json:"currency"`
	Timezone          string          `json:"timezone"`
	VendorPriceSpec   json.RawMessage `json:"vendorPriceSpec"`
	LLMAPIPriceSpec   json.RawMessage `json:"llmapiPriceSpec"`
	RuntimePricingRef json.RawMessage `json:"runtimePricingRef"`
	Published         bool            `json:"published"`
	SortOrder         int             `json:"sortOrder"`
}

func registerModelPriceRoutes(r *gin.RouterGroup) {
	r.GET("/model-prices", listAdminModelPrices)
	r.POST("/model-prices/sync-preview", saveModelPriceSyncPreview)
	r.GET("/model-prices/:id", getAdminModelPrice)
	r.POST("/model-prices", createModelPrice)
	r.PUT("/model-prices/:id", updateModelPrice)
	r.DELETE("/model-prices/:id", deleteModelPrice)
	r.POST("/model-prices/:id/apply-sync", applyModelPriceSync)
}

func getPublicModelPrices(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err = syncExistingModelPrices(db); err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var rows []modelPriceCatalog
	q := strings.TrimSpace(c.Query("q"))
	query := db.Where("published = ?", true)
	if q != "" {
		query = query.Where("model_key ILIKE ? OR display_name ILIKE ? OR vendor ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}
	err = query.Order("sort_order asc, id asc").Find(&rows).Error
	c.JSON(200, gin.H{"success": err == nil, "data": rows})
}

func listAdminModelPrices(c *gin.Context) {
	db, err := platformDatabase()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err = syncExistingModelPrices(db); err != nil {
		c.JSON(500, gin.H{"success": false, "message": err.Error()})
		return
	}
	var rows []modelPriceCatalog
	q := strings.TrimSpace(c.Query("q"))
	query := db
	if q != "" {
		query = query.Where("model_key ILIKE ? OR display_name ILIKE ? OR vendor ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}
	err = query.Order("sort_order asc, id asc").Find(&rows).Error
	c.JSON(200, gin.H{"success": err == nil, "data": rows})
}

func syncExistingModelPrices(db *gorm.DB) error {
	vendorNames := make(map[int]string)
	vendors, err := model.GetAllVendors(0, 100000)
	if err != nil {
		return err
	}
	for _, vendor := range vendors {
		vendorNames[vendor.Id] = vendor.Name
	}
	pricingByName := make(map[string]model.Pricing)
	for _, pricing := range model.GetPricing() {
		pricingByName[pricing.ModelName] = pricing
	}
	models, err := model.GetAllModels(0, 100000)
	if err != nil {
		return err
	}
	rows := make([]modelPriceCatalog, 0, len(models))
	seen := make(map[string]struct{}, len(models))
	for index, metadata := range models {
		name := strings.TrimSpace(metadata.ModelName)
		if name == "" {
			continue
		}
		seen[name] = struct{}{}
		pricing, hasPricing := pricingByName[name]
		vendorID := metadata.VendorID
		if vendorID == 0 {
			vendorID = pricing.VendorID
		}
		vendor := vendorNames[vendorID]
		if vendor == "" {
			vendor = strings.TrimSpace(pricing.OwnerBy)
		}
		if vendor == "" {
			vendor = "Other"
		}
		tagsRaw := metadata.Tags
		if tagsRaw == "" {
			tagsRaw = pricing.Tags
		}
		tags := splitModelTags(tagsRaw)
		tagsJSON, _ := json.Marshal(tags)
		priceSpec := json.RawMessage(`{}`)
		if hasPricing {
			priceSpec, _ = json.Marshal(runtimePriceSpec(pricing))
		}
		rows = append(rows, modelPriceCatalog{
			ModelKey: name, DisplayName: name, Vendor: vendor,
			Tags: tagsJSON, Currency: "USD", Timezone: "Asia/Shanghai",
			VendorPriceSpec: json.RawMessage(`{}`), LLMAPIPriceSpec: priceSpec,
			RuntimePricingRef: json.RawMessage(`{"source":"new-api"}`),
			Published:         true, SortOrder: index,
		})
	}
	for name, pricing := range pricingByName {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		vendor := vendorNames[pricing.VendorID]
		if vendor == "" {
			vendor = strings.TrimSpace(pricing.OwnerBy)
		}
		if vendor == "" {
			vendor = "Other"
		}
		tagsJSON, _ := json.Marshal(splitModelTags(pricing.Tags))
		priceSpec, _ := json.Marshal(runtimePriceSpec(pricing))
		rows = append(rows, modelPriceCatalog{
			ModelKey: name, DisplayName: name, Vendor: vendor,
			Tags: tagsJSON, Currency: "USD", Timezone: "Asia/Shanghai",
			VendorPriceSpec: json.RawMessage(`{}`), LLMAPIPriceSpec: priceSpec,
			RuntimePricingRef: json.RawMessage(`{"source":"new-api"}`),
			Published:         true, SortOrder: len(rows),
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "model_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"llm_api_price_spec", "runtime_pricing_ref"}),
	}).CreateInBatches(rows, 200).Error
}

func splitModelTags(raw string) []string {
	var tags []string
	if json.Unmarshal([]byte(raw), &tags) == nil {
		return tags
	}
	for _, value := range strings.Split(raw, ",") {
		if value = strings.TrimSpace(value); value != "" {
			tags = append(tags, value)
		}
	}
	return tags
}

func runtimePriceSpec(pricing model.Pricing) map[string]any {
	if pricing.BillingMode == "tiered_expr" && pricing.BillingExpr != "" {
		return map[string]any{"mode": "expression", "blocks": []any{map[string]any{"label": "Expression", "note": pricing.BillingExpr}}}
	}
	if pricing.ModelPrice > 0 {
		return map[string]any{"mode": "request", "blocks": []any{map[string]any{"price": pricing.ModelPrice, "unit": "request"}}}
	}
	input := pricing.ModelRatio * 2
	return map[string]any{"mode": "token", "blocks": []any{map[string]any{"input": input, "output": input * pricing.CompletionRatio, "unit": "1M tokens"}}}
}

func getAdminModelPrice(c *gin.Context) {
	db, err := platformDatabase()
	var row modelPriceCatalog
	if err == nil {
		err = db.First(&row, c.Param("id")).Error
	}
	if err != nil {
		c.JSON(404, gin.H{"success": false, "message": "model price not found"})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": row})
}

func normalizePriceJSON(raw json.RawMessage, fallback string) (json.RawMessage, error) {
	if len(raw) == 0 || string(raw) == "null" {
		raw = json.RawMessage(fallback)
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	if len(encoded) > 256*1024 {
		return nil, fmt.Errorf("price specification is too large")
	}
	return json.RawMessage(encoded), nil
}

func bindModelPrice(c *gin.Context) (modelPriceCatalog, error) {
	var in modelPriceInput
	if err := c.ShouldBindJSON(&in); err != nil {
		return modelPriceCatalog{}, err
	}
	in.ModelKey, in.DisplayName, in.Vendor = strings.TrimSpace(in.ModelKey), strings.TrimSpace(in.DisplayName), strings.TrimSpace(in.Vendor)
	if in.ModelKey == "" || in.DisplayName == "" || in.Vendor == "" {
		return modelPriceCatalog{}, fmt.Errorf("model, display name and vendor are required")
	}
	tags, err := normalizePriceJSON(in.Tags, "[]")
	if err != nil {
		return modelPriceCatalog{}, fmt.Errorf("invalid tags: %w", err)
	}
	vendor, err := normalizePriceJSON(in.VendorPriceSpec, "{}")
	if err != nil {
		return modelPriceCatalog{}, fmt.Errorf("invalid vendor price: %w", err)
	}
	ours, err := normalizePriceJSON(in.LLMAPIPriceSpec, "{}")
	if err != nil {
		return modelPriceCatalog{}, fmt.Errorf("invalid LLMAPI price: %w", err)
	}
	ref, err := normalizePriceJSON(in.RuntimePricingRef, "{}")
	if err != nil {
		return modelPriceCatalog{}, fmt.Errorf("invalid runtime reference: %w", err)
	}
	if in.Currency == "" {
		in.Currency = "CNY"
	}
	if in.Timezone == "" {
		in.Timezone = "Asia/Shanghai"
	}
	return modelPriceCatalog{ModelKey: in.ModelKey, DisplayName: in.DisplayName, Vendor: in.Vendor, Tags: tags, Currency: in.Currency, Timezone: in.Timezone, VendorPriceSpec: vendor, LLMAPIPriceSpec: ours, RuntimePricingRef: ref, Published: in.Published, SortOrder: in.SortOrder}, nil
}

func createModelPrice(c *gin.Context) {
	row, err := bindModelPrice(c)
	if err == nil {
		db, e := platformDatabase()
		err = e
		if err == nil {
			err = db.Create(&row).Error
		}
	}
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": row})
}
func updateModelPrice(c *gin.Context) {
	row, err := bindModelPrice(c)
	if err == nil {
		db, e := platformDatabase()
		err = e
		if err == nil {
			err = db.Model(&modelPriceCatalog{}).Where("id = ?", c.Param("id")).Updates(map[string]any{"model_key": row.ModelKey, "display_name": row.DisplayName, "vendor": row.Vendor, "tags": row.Tags, "currency": row.Currency, "timezone": row.Timezone, "vendor_price_spec": row.VendorPriceSpec, "llm_api_price_spec": row.LLMAPIPriceSpec, "runtime_pricing_ref": row.RuntimePricingRef, "published": row.Published, "sort_order": row.SortOrder}).Error
		}
	}
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}
func deleteModelPrice(c *gin.Context) {
	db, err := platformDatabase()
	if err == nil {
		err = db.Delete(&modelPriceCatalog{}, c.Param("id")).Error
	}
	c.JSON(200, gin.H{"success": err == nil})
}

// sync-preview accepts normalized vendor specs selected from new-api's existing
// upstream ratio synchronizer. It records candidates without changing live data.
func saveModelPriceSyncPreview(c *gin.Context) {
	var input struct {
		Source string `json:"source"`
		Items  []struct {
			ModelKey string          `json:"modelKey"`
			Spec     json.RawMessage `json:"spec"`
			Source   string          `json:"source"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	db, err := platformDatabase()
	changed := 0
	if err == nil {
		err = db.Transaction(func(tx *gorm.DB) error {
			now := time.Now()
			for _, item := range input.Items {
				spec, e := normalizePriceJSON(item.Spec, "{}")
				if e != nil {
					return e
				}
				var row modelPriceCatalog
				if e = tx.Where("model_key = ?", item.ModelKey).First(&row).Error; e != nil {
					if e == gorm.ErrRecordNotFound {
						row = modelPriceCatalog{ModelKey: item.ModelKey, DisplayName: item.ModelKey, Vendor: "Upstream", Tags: json.RawMessage(`[]`), Currency: "USD", Timezone: "Asia/Shanghai", VendorPriceSpec: json.RawMessage(`{}`), LLMAPIPriceSpec: json.RawMessage(`{}`), RuntimePricingRef: json.RawMessage(`{"source":"upstream"}`), Published: false}
						if e = tx.Create(&row).Error; e != nil {
							return e
						}
					} else {
						return e
					}
				}
				status := "same"
				if string(row.VendorPriceSpec) != string(spec) {
					status = "changed"
					changed++
				}
				source := strings.TrimSpace(item.Source)
				if source == "" {
					source = input.Source
				}
				if e = tx.Model(&row).Updates(map[string]any{"pending_vendor_spec": spec, "upstream_source": source, "sync_status": status, "last_synced_at": now}).Error; e != nil {
					return e
				}
			}
			return nil
		})
	}
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"changed": changed}})
}
func applyModelPriceSync(c *gin.Context) {
	db, err := platformDatabase()
	var row modelPriceCatalog
	if err == nil {
		err = db.First(&row, c.Param("id")).Error
	}
	if err == nil && len(row.PendingVendorSpec) > 0 {
		err = db.Model(&row).Updates(map[string]any{"vendor_price_spec": row.PendingVendorSpec, "pending_vendor_spec": nil, "sync_status": "applied"}).Error
	}
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}
