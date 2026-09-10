package platform

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
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
	Description       string          `gorm:"size:500" json:"description"`
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
	Description       string          `json:"description"`
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

type modelsDevCost struct {
	Input     *float64 `json:"input"`
	Output    *float64 `json:"output"`
	CacheRead *float64 `json:"cache_read"`
}

type modelsDevModel struct {
	Cost modelsDevCost `json:"cost"`
}

type modelsDevProvider struct {
	Models map[string]modelsDevModel `json:"models"`
}

func normalizedVendor(value string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + ('a' - 'A')
		}
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, value)
}

func preferredModelsDevProvider(vendor string, candidates map[string]modelsDevCost) string {
	wanted := normalizedVendor(vendor)
	names := make([]string, 0, len(candidates))
	for name := range candidates {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if wanted != "" && wanted != "upstream" && normalizedVendor(name) == wanted {
			return name
		}
	}
	for _, name := range names {
		normalized := normalizedVendor(name)
		if wanted != "" && wanted != "upstream" && (strings.Contains(normalized, wanted) || strings.Contains(wanted, normalized)) {
			return name
		}
	}
	best := ""
	bestInput := 0.0
	for _, name := range names {
		input := candidates[name].Input
		if input != nil && *input > 0 && (best == "" || *input < bestInput) {
			best, bestInput = name, *input
		}
	}
	return best
}

func previewModelsDevPrices(c *gin.Context) {
	request, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, "https://models.dev/api.json", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	client := &http.Client{Timeout: 20 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": err.Error()})
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": response.Status})
		return
	}
	var providers map[string]modelsDevProvider
	if err = json.NewDecoder(io.LimitReader(response.Body, 32<<20)).Decode(&providers); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": err.Error()})
		return
	}
	db, err := platformDatabase()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	var rows []modelPriceCatalog
	if err = db.Select("model_key", "vendor").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	result := make(map[string]any)
	for _, row := range rows {
		candidates := make(map[string]modelsDevCost)
		for provider, data := range providers {
			if entry, exists := data.Models[row.ModelKey]; exists && entry.Cost.Input != nil {
				candidates[provider] = entry.Cost
			}
		}
		provider := preferredModelsDevProvider(row.Vendor, candidates)
		if provider == "" {
			continue
		}
		cost := candidates[provider]
		values := map[string]any{"_source_provider": provider, "_source_url": "https://models.dev/api.json", "billing_mode": "ratio"}
		if cost.Input != nil {
			values["model_ratio"] = *cost.Input / 2
			if *cost.Input > 0 && cost.Output != nil {
				values["completion_ratio"] = *cost.Output / *cost.Input
			}
			if *cost.Input > 0 && cost.CacheRead != nil {
				values["cache_ratio"] = *cost.CacheRead / *cost.Input
			}
		}
		result[row.ModelKey] = values
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
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
		query = query.Where("model_key ILIKE ? OR display_name ILIKE ? OR description ILIKE ? OR vendor ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%", "%"+q+"%")
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
		query = query.Where("model_key ILIKE ? OR display_name ILIKE ? OR description ILIKE ? OR vendor ILIKE ?", "%"+q+"%", "%"+q+"%", "%"+q+"%", "%"+q+"%")
	}
	err = query.Order("sort_order asc, id asc").Find(&rows).Error
	c.JSON(200, gin.H{"success": err == nil, "data": rows})
}

func syncExistingModelPrices(db *gorm.DB) error {
	var storedRows []modelPriceCatalog
	if err := db.Select("model_key", "llm_api_price_spec").Find(&storedRows).Error; err != nil {
		return err
	}
	storedBlockMetadata := make(map[string]map[string]any, len(storedRows))
	for _, row := range storedRows {
		var spec struct {
			Blocks []map[string]any `json:"blocks"`
		}
		if json.Unmarshal(row.LLMAPIPriceSpec, &spec) == nil && len(spec.Blocks) > 0 {
			metadata := make(map[string]any)
			for _, key := range []string{"discount", "baseExpression", "usageRuleSet"} {
				if value, exists := spec.Blocks[0][key]; exists {
					metadata[key] = value
				}
			}
			if len(metadata) > 0 {
				storedBlockMetadata[row.ModelKey] = metadata
			}
		}
	}
	priceSpecFor := func(name string, pricing model.Pricing) json.RawMessage {
		spec := runtimePriceSpec(pricing)
		if metadata, exists := storedBlockMetadata[name]; exists {
			if blocks, ok := spec["blocks"].([]any); ok && len(blocks) > 0 {
				if block, ok := blocks[0].(map[string]any); ok {
					for key, value := range metadata {
						block[key] = value
					}
				}
			}
		}
		encoded, _ := json.Marshal(spec)
		return encoded
	}
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
	pricingSnapshot, err := model.GetModelPricingSnapshot(nil)
	if err != nil {
		return err
	}
	configuredPricing := make(map[string]bool, len(pricingSnapshot.Entries))
	for _, entry := range pricingSnapshot.Entries {
		_, hasModelPrice := entry.Configured["ModelPrice"]
		_, hasModelRatio := entry.Configured["ModelRatio"]
		_, hasBillingExpression := entry.Configured["billing_setting.billing_expr"]
		configuredPricing[entry.ModelName] = hasModelPrice || hasModelRatio || hasBillingExpression
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
		if hasPricing && configuredPricing[name] {
			priceSpec = priceSpecFor(name, pricing)
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
		priceSpec := json.RawMessage(`{}`)
		if configuredPricing[name] {
			priceSpec = priceSpecFor(name, pricing)
		}
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
	block := map[string]any{
		"input":  input,
		"output": input * pricing.CompletionRatio,
		"unit":   "1M tokens",
	}
	if pricing.CacheRatio != nil {
		block["cache"] = input * *pricing.CacheRatio
	}
	if pricing.CreateCacheRatio != nil {
		block["createCache"] = input * *pricing.CreateCacheRatio
	}
	if pricing.ImageRatio != nil {
		block["image"] = input * *pricing.ImageRatio
	}
	if pricing.AudioRatio != nil {
		audioInput := input * *pricing.AudioRatio
		block["audioInput"] = audioInput
		if pricing.AudioCompletionRatio != nil {
			block["audioOutput"] = audioInput * *pricing.AudioCompletionRatio
		}
	}
	return map[string]any{"mode": "token", "blocks": []any{block}}
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
	in.ModelKey, in.DisplayName, in.Description, in.Vendor = strings.TrimSpace(in.ModelKey), strings.TrimSpace(in.DisplayName), strings.TrimSpace(in.Description), strings.TrimSpace(in.Vendor)
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
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	if in.Currency == "" {
		in.Currency = "CNY"
	}
	if in.Currency != "USD" && in.Currency != "CNY" {
		return modelPriceCatalog{}, fmt.Errorf("display currency must be USD or CNY")
	}
	if in.Timezone == "" {
		in.Timezone = "Asia/Shanghai"
	}
	return modelPriceCatalog{ModelKey: in.ModelKey, DisplayName: in.DisplayName, Description: in.Description, Vendor: in.Vendor, Tags: tags, Currency: in.Currency, Timezone: in.Timezone, VendorPriceSpec: vendor, LLMAPIPriceSpec: ours, RuntimePricingRef: ref, Published: in.Published, SortOrder: in.SortOrder}, nil
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
			err = db.Model(&modelPriceCatalog{}).Where("id = ?", c.Param("id")).Updates(map[string]any{"display_name": row.DisplayName, "description": row.Description, "vendor": row.Vendor, "tags": row.Tags, "currency": row.Currency, "timezone": row.Timezone, "vendor_price_spec": row.VendorPriceSpec, "llm_api_price_spec": row.LLMAPIPriceSpec, "runtime_pricing_ref": row.RuntimePricingRef, "published": row.Published, "sort_order": row.SortOrder}).Error
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
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	var row modelPriceCatalog
	if err = db.First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "model price not found"})
		return
	}
	var runtimeRef struct {
		Source string `json:"source"`
	}
	_ = json.Unmarshal(row.RuntimePricingRef, &runtimeRef)
	if runtimeRef.Source == "new-api" {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "This model is synchronized from new-api and cannot be deleted here. Remove it from model management or hide it from the public price page."})
		return
	}
	result := db.Delete(&row)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
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
	var input struct {
		BlockIndex int `json:"blockIndex"`
	}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	db, err := platformDatabase()
	var row modelPriceCatalog
	if err == nil {
		err = db.First(&row, c.Param("id")).Error
	}
	if err == nil && len(row.PendingVendorSpec) > 0 {
		var pending struct {
			Mode   string            `json:"mode"`
			Blocks []json.RawMessage `json:"blocks"`
		}
		if err = json.Unmarshal(row.PendingVendorSpec, &pending); err == nil {
			if input.BlockIndex < 0 || input.BlockIndex >= len(pending.Blocks) {
				err = fmt.Errorf("invalid upstream price selection")
			} else {
				selectedMode := pending.Mode
				var selectedFields map[string]any
				if json.Unmarshal(pending.Blocks[input.BlockIndex], &selectedFields) == nil {
					if _, exists := selectedFields["price"]; exists {
						selectedMode = "request"
					} else if _, exists := selectedFields["input"]; exists {
						selectedMode = "token"
					}
				}
				selected, marshalErr := json.Marshal(map[string]any{"mode": selectedMode, "blocks": []json.RawMessage{pending.Blocks[input.BlockIndex]}})
				if marshalErr != nil {
					err = marshalErr
				} else {
					var block struct {
						Label string `json:"label"`
					}
					_ = json.Unmarshal(pending.Blocks[input.BlockIndex], &block)
					err = db.Model(&row).Updates(map[string]any{"vendor_price_spec": selected, "pending_vendor_spec": nil, "upstream_source": strings.TrimSpace(block.Label), "sync_status": "applied"}).Error
				}
			}
		}
	}
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{"success": true})
}
