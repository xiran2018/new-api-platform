package platform

import (
	"strings"
	"testing"
)

func TestMoneyToCents(t *testing.T) {
	for _, test := range []struct {
		input float64
		want  int64
	}{{12.345, 1235}, {0.01, 1}, {99.999, 10000}} {
		if got := moneyToCents(test.input); got != test.want {
			t.Fatalf("moneyToCents(%v) = %d, want %d", test.input, got, test.want)
		}
	}
}

func TestValidTransition(t *testing.T) {
	if !validTransition(invoiceStatusPending, invoiceStatusProcessing, false) {
		t.Fatal("pending should move to processing")
	}
	if validTransition(invoiceStatusPending, invoiceStatusCompleted, true) {
		t.Fatal("pending must not complete through status endpoint")
	}
	if !validTransition(invoiceStatusRejected, invoiceStatusPending, false) {
		t.Fatal("rejected should reopen")
	}
}

func TestSanitizeRichHTML(t *testing.T) {
	input := `<p onclick="bad()">safe<script>alert(1)</script><img src="javascript:bad" onerror="bad()"><a href="https://example.com" target="_blank">link</a></p>`
	got, err := sanitizeRichHTML(input)
	if err != nil {
		t.Fatal(err)
	}
	for _, unsafe := range []string{"onclick", "onerror", "javascript:", "<script"} {
		if strings.Contains(got, unsafe) {
			t.Fatalf("unsafe content remained: %s", got)
		}
	}
	if !strings.Contains(got, `href="https://example.com"`) {
		t.Fatalf("safe link removed: %s", got)
	}
}
