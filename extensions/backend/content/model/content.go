package content

// Content is the platform-owned CMS record. Persistence and migration wiring
// intentionally live in this extension, not in new-api core models.
type Content struct {
	ID        uint64
	Type      string
	Slug      string
	Title     string
	Summary   string
	Body      string
	Status    string
	SortOrder int
}
