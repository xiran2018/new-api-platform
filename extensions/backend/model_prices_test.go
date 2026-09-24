package platform

import "testing"

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
