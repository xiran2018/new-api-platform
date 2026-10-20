package platform

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestDiscoveredModelFlagsPreserveAdministratorChoice(t *testing.T) {
	tests := []struct {
		name              string
		stored            map[string]storedModelFlags
		defaultPublished  bool
		defaultAPIEnabled bool
		wantPublished     bool
		wantAPIEnabled    bool
	}{
		{
			name:             "saved hidden state wins over discovery default",
			stored:           map[string]storedModelFlags{"model-a": {published: false, apiEnabled: true}},
			defaultPublished: true,
			wantPublished:    false,
			wantAPIEnabled:   false,
		},
		{
			name:              "saved visible and callable state is retained",
			stored:            map[string]storedModelFlags{"model-a": {published: true, apiEnabled: true}},
			defaultPublished:  false,
			defaultAPIEnabled: false,
			wantPublished:     true,
			wantAPIEnabled:    true,
		},
		{
			name:              "newly discovered model uses defaults",
			stored:            nil,
			defaultPublished:  true,
			defaultAPIEnabled: false,
			wantPublished:     true,
			wantAPIEnabled:    false,
		},
		{
			name:              "hidden default cannot enable API",
			stored:            nil,
			defaultPublished:  false,
			defaultAPIEnabled: true,
			wantPublished:     false,
			wantAPIEnabled:    false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			published, apiEnabled := discoveredModelFlags(
				test.stored,
				"model-a",
				test.defaultPublished,
				test.defaultAPIEnabled,
			)
			if published != test.wantPublished || apiEnabled != test.wantAPIEnabled {
				t.Fatalf(
					"discoveredModelFlags() = (%v, %v), want (%v, %v)",
					published,
					apiEnabled,
					test.wantPublished,
					test.wantAPIEnabled,
				)
			}
		})
	}
}

func TestSyncManagedModelFlagsCreatesMetadataForDiscoveredModel(t *testing.T) {
	originalDB := model.DB
	originalIsMasterNode := common.IsMasterNode
	originalSQLitePath := common.SQLitePath
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")
	common.IsMasterNode = false
	common.SQLitePath = fmt.Sprintf("file:%s_init?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, os.Setenv("SQL_DSN", "local"))
	require.NoError(t, model.InitDB())
	if initializedDB, dbErr := model.DB.DB(); dbErr == nil {
		_ = initializedDB.Close()
	}

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Model{}, &model.Channel{}, &model.Ability{}, &model.Vendor{}))
	t.Cleanup(func() {
		model.DB = originalDB
		model.InvalidatePricingCache()
		common.IsMasterNode = originalIsMasterNode
		common.SQLitePath = originalSQLitePath
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		if hadSQLDSN {
			_ = os.Setenv("SQL_DSN", originalSQLDSN)
		} else {
			_ = os.Unsetenv("SQL_DSN")
		}
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	require.NoError(t, syncManagedModelFlags(modelPriceCatalog{
		ModelKey:   "channel-discovered-model",
		Published:  true,
		APIEnabled: false,
	}))

	var metadata model.Model
	require.NoError(t, db.Where("model_name = ?", "channel-discovered-model").First(&metadata).Error)
	require.Equal(t, 1, metadata.Status)
	require.False(t, metadata.APIEnabled)
	require.Equal(t, model.NameRuleExact, metadata.NameRule)
}
