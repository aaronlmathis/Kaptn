package logs

import (
	"sort"
	"sync"
	"time"
)

// TimeBucket represents a time-based bucket for indexing
type TimeBucket struct {
	StartTime time.Time
	EndTime   time.Time
	Indices   []int // entry indices in this bucket
}

// PostingList represents a list of entry indices for a particular field value
type PostingList []int

// LogIndex provides lightweight indexing for fast log queries
type LogIndex struct {
	mu sync.RWMutex

	// Time-based buckets (per-minute granularity)
	timeBuckets map[int64]*TimeBucket // key: unix timestamp in minutes

	// Field-based indexes
	levelIndex     map[string]PostingList // level -> posting list
	namespaceIndex map[string]PostingList // namespace -> posting list
	workloadIndex  map[string]PostingList // workload -> posting list
	podIndex       map[string]PostingList // pod -> posting list

	// LRU cache for trace_id lookups (limited size)
	traceIndex *TraceIndexLRU

	// Statistics
	totalEntries int
	bucketCount  int
}

// TraceIndexLRU provides LRU caching for trace ID lookups
type TraceIndexLRU struct {
	mu       sync.RWMutex
	capacity int
	items    map[string]*traceItem
	order    *traceNode // doubly-linked list for LRU ordering
}

type traceItem struct {
	indices []int
	node    *traceNode
}

type traceNode struct {
	key  string
	prev *traceNode
	next *traceNode
}

// NewLogIndex creates a new log index
func NewLogIndex(traceIndexCapacity int) *LogIndex {
	return &LogIndex{
		timeBuckets:    make(map[int64]*TimeBucket),
		levelIndex:     make(map[string]PostingList),
		namespaceIndex: make(map[string]PostingList),
		workloadIndex:  make(map[string]PostingList),
		podIndex:       make(map[string]PostingList),
		traceIndex:     NewTraceIndexLRU(traceIndexCapacity),
	}
}

// AddEntry adds a log entry to the index
func (idx *LogIndex) AddEntry(entry LogEntry, entryIndex int) {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	idx.totalEntries++

	// Add to time bucket (per-minute granularity)
	bucketKey := entry.TS.Unix() / 60
	bucket := idx.timeBuckets[bucketKey]
	if bucket == nil {
		bucket = &TimeBucket{
			StartTime: time.Unix(bucketKey*60, 0),
			EndTime:   time.Unix((bucketKey+1)*60, 0),
		}
		idx.timeBuckets[bucketKey] = bucket
		idx.bucketCount++
	}
	bucket.Indices = append(bucket.Indices, entryIndex)

	// Add to field indexes
	if entry.Level != "" {
		idx.levelIndex[entry.Level] = append(idx.levelIndex[entry.Level], entryIndex)
	}
	if entry.Namespace != "" {
		idx.namespaceIndex[entry.Namespace] = append(idx.namespaceIndex[entry.Namespace], entryIndex)
	}
	if entry.Workload != "" {
		idx.workloadIndex[entry.Workload] = append(idx.workloadIndex[entry.Workload], entryIndex)
	}
	if entry.Pod != "" {
		idx.podIndex[entry.Pod] = append(idx.podIndex[entry.Pod], entryIndex)
	}

	// Add to trace index if present
	if entry.TraceID != "" {
		idx.traceIndex.Add(entry.TraceID, entryIndex)
	}
}

// QueryPlan represents an optimized query execution plan
type QueryPlan struct {
	TimeRange    []int64     // bucket keys to scan
	IndexLookups []IndexTerm // index terms to intersect
	TextFilter   string      // text to search for (post-index)
	SortRequired bool        // whether results need sorting
}

// IndexTerm represents a term to look up in an index
type IndexTerm struct {
	Field string // "level", "namespace", "workload", "pod", "trace_id"
	Value string
}

// BuildQueryPlan creates an optimized execution plan for a filter
func (idx *LogIndex) BuildQueryPlan(filter LogFilter) QueryPlan {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	plan := QueryPlan{
		TextFilter:   filter.Text,
		SortRequired: true, // Always sort for consistent ordering
	}

	// Determine time range buckets to scan
	if !filter.Since.IsZero() || !filter.Until.IsZero() {
		plan.TimeRange = idx.getTimeBucketsInRange(filter.Since, filter.Until)
	}

	// Add selective index terms (most selective first)
	selectivity := idx.estimateSelectivity(filter)

	// Sort index terms by selectivity (most selective first)
	var terms []IndexTerm
	for _, term := range selectivity {
		terms = append(terms, term.Term)
	}
	plan.IndexLookups = terms

	return plan
}

// selectivityEstimate represents the estimated selectivity of an index term
type selectivityEstimate struct {
	Term        IndexTerm
	Selectivity float64 // 0.0 = most selective, 1.0 = least selective
	Count       int     // estimated result count
}

// estimateSelectivity estimates the selectivity of each filter term
func (idx *LogIndex) estimateSelectivity(filter LogFilter) []selectivityEstimate {
	var estimates []selectivityEstimate

	// Level selectivity - combine all levels into a single estimate
	if len(filter.Levels) > 0 {
		totalCount := 0
		for _, level := range filter.Levels {
			if posting := idx.levelIndex[level]; posting != nil {
				totalCount += len(posting)
			}
		}
		if totalCount > 0 {
			// Use the first level as the representative term
			estimates = append(estimates, selectivityEstimate{
				Term:        IndexTerm{Field: "levels", Value: filter.Levels[0]}, // Use special "levels" field
				Selectivity: float64(totalCount) / float64(idx.totalEntries),
				Count:       totalCount,
			})
		}
	}

	// Namespace selectivity
	if filter.Namespace != "" {
		count := len(idx.namespaceIndex[filter.Namespace])
		if count > 0 {
			estimates = append(estimates, selectivityEstimate{
				Term:        IndexTerm{Field: "namespace", Value: filter.Namespace},
				Selectivity: float64(count) / float64(idx.totalEntries),
				Count:       count,
			})
		}
	}

	// Workload selectivity
	if filter.Workload != "" {
		count := len(idx.workloadIndex[filter.Workload])
		if count > 0 {
			estimates = append(estimates, selectivityEstimate{
				Term:        IndexTerm{Field: "workload", Value: filter.Workload},
				Selectivity: float64(count) / float64(idx.totalEntries),
				Count:       count,
			})
		}
	}

	// Pod selectivity (usually most selective)
	if filter.Pod != "" {
		count := len(idx.podIndex[filter.Pod])
		if count > 0 {
			estimates = append(estimates, selectivityEstimate{
				Term:        IndexTerm{Field: "pod", Value: filter.Pod},
				Selectivity: float64(count) / float64(idx.totalEntries),
				Count:       count,
			})
		}
	}

	// Sort by selectivity (most selective first)
	sort.Slice(estimates, func(i, j int) bool {
		return estimates[i].Selectivity < estimates[j].Selectivity
	})

	return estimates
}

// ExecutePlan executes a query plan and returns matching entry indices
func (idx *LogIndex) ExecutePlan(plan QueryPlan, filter LogFilter) []int {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	var candidates []int

	// Start with time-based filtering if specified
	if len(plan.TimeRange) > 0 {
		candidates = idx.getIndicesFromTimeBuckets(plan.TimeRange)
	} else {
		// No time filter - get all valid indices from the index
		candidates = idx.getAllValidIndices()
	}

	// Apply index lookups in order (most selective first)
	for _, term := range plan.IndexLookups {
		var posting PostingList

		if term.Field == "levels" {
			// Special handling for levels - union multiple posting lists
			posting = idx.getLevelsPostingList(filter.Levels)
		} else {
			posting = idx.getPostingList(term.Field, term.Value)
		}

		if posting == nil {
			// No matches for this term
			return nil
		}
		candidates = intersectSorted(candidates, posting)
		if len(candidates) == 0 {
			// Early termination - no results
			return nil
		}
	}

	return candidates
}

// getTimeBucketsInRange returns bucket keys that overlap with the time range
func (idx *LogIndex) getTimeBucketsInRange(since, until time.Time) []int64 {
	var buckets []int64

	// If no time bounds specified, return all buckets
	if since.IsZero() && until.IsZero() {
		for key := range idx.timeBuckets {
			buckets = append(buckets, key)
		}
		sort.Slice(buckets, func(i, j int) bool { return buckets[i] < buckets[j] })
		return buckets
	}

	// Calculate bucket range
	var startBucket, endBucket int64
	if !since.IsZero() {
		startBucket = since.Unix() / 60
	} else {
		startBucket = 0
	}
	if !until.IsZero() {
		endBucket = until.Unix() / 60
	} else {
		endBucket = time.Now().Unix() / 60
	}

	// Collect overlapping buckets
	for key, bucket := range idx.timeBuckets {
		if key >= startBucket && key <= endBucket {
			// Additional check: bucket actually overlaps with time range
			bucketOverlaps := true
			if !since.IsZero() && bucket.EndTime.Before(since) {
				bucketOverlaps = false
			}
			if !until.IsZero() && bucket.StartTime.After(until) {
				bucketOverlaps = false
			}
			if bucketOverlaps {
				buckets = append(buckets, key)
			}
		}
	}

	sort.Slice(buckets, func(i, j int) bool { return buckets[i] < buckets[j] })
	return buckets
}

// getIndicesFromTimeBuckets extracts all entry indices from time buckets
func (idx *LogIndex) getIndicesFromTimeBuckets(bucketKeys []int64) []int {
	var indices []int
	for _, key := range bucketKeys {
		if bucket := idx.timeBuckets[key]; bucket != nil {
			indices = append(indices, bucket.Indices...)
		}
	}

	// Sort indices for efficient intersection
	sort.Ints(indices)
	return indices
}

// getAllValidIndices returns all valid indices currently in the index
func (idx *LogIndex) getAllValidIndices() []int {
	var allIndices []int
	seen := make(map[int]bool)

	// Collect indices from all time buckets
	for _, bucket := range idx.timeBuckets {
		for _, index := range bucket.Indices {
			if !seen[index] {
				allIndices = append(allIndices, index)
				seen[index] = true
			}
		}
	}

	// Sort for consistent ordering and efficient intersection
	sort.Ints(allIndices)
	return allIndices
}

// getPostingList retrieves the posting list for a field/value pair
func (idx *LogIndex) getPostingList(field, value string) PostingList {
	switch field {
	case "level":
		return idx.levelIndex[value]
	case "namespace":
		return idx.namespaceIndex[value]
	case "workload":
		return idx.workloadIndex[value]
	case "pod":
		return idx.podIndex[value]
	case "trace_id":
		return idx.traceIndex.Get(value)
	default:
		return nil
	}
}

// getLevelsPostingList returns a union of posting lists for multiple levels
func (idx *LogIndex) getLevelsPostingList(levels []string) PostingList {
	var allIndices []int
	seen := make(map[int]bool)

	for _, level := range levels {
		if posting := idx.levelIndex[level]; posting != nil {
			for _, index := range posting {
				if !seen[index] {
					allIndices = append(allIndices, index)
					seen[index] = true
				}
			}
		}
	}

	// Sort the result for efficient intersection
	sort.Ints(allIndices)
	return PostingList(allIndices)
}

// intersectSorted intersects two sorted slices of integers
func intersectSorted(a, b []int) []int {
	var result []int
	i, j := 0, 0

	for i < len(a) && j < len(b) {
		if a[i] == b[j] {
			result = append(result, a[i])
			i++
			j++
		} else if a[i] < b[j] {
			i++
		} else {
			j++
		}
	}

	return result
}

// EvictByTime removes old entries from the index
func (idx *LogIndex) EvictByTime(cutoff time.Time, validIndices map[int]bool) {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	cutoffBucket := cutoff.Unix() / 60

	// Remove old time buckets
	for key := range idx.timeBuckets {
		if key < cutoffBucket {
			delete(idx.timeBuckets, key)
			idx.bucketCount--
		}
	}

	// Clean up field indexes by removing invalid indices
	idx.cleanPostingLists(idx.levelIndex, validIndices)
	idx.cleanPostingLists(idx.namespaceIndex, validIndices)
	idx.cleanPostingLists(idx.workloadIndex, validIndices)
	idx.cleanPostingLists(idx.podIndex, validIndices)

	// Clean up remaining time buckets
	for _, bucket := range idx.timeBuckets {
		bucket.Indices = idx.filterValidIndices(bucket.Indices, validIndices)
	}

	// Update total count
	idx.totalEntries = len(validIndices)
}

// cleanPostingLists removes invalid indices from all posting lists in a map
func (idx *LogIndex) cleanPostingLists(index map[string]PostingList, validIndices map[int]bool) {
	for key, posting := range index {
		cleaned := idx.filterValidIndices(posting, validIndices)
		if len(cleaned) == 0 {
			delete(index, key)
		} else {
			index[key] = cleaned
		}
	}
}

// filterValidIndices keeps only indices that are in the valid set
func (idx *LogIndex) filterValidIndices(indices []int, validIndices map[int]bool) []int {
	var result []int
	for _, idx := range indices {
		if validIndices[idx] {
			result = append(result, idx)
		}
	}
	return result
}

// Clear removes all entries from the index
func (idx *LogIndex) Clear() {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	idx.timeBuckets = make(map[int64]*TimeBucket)
	idx.levelIndex = make(map[string]PostingList)
	idx.namespaceIndex = make(map[string]PostingList)
	idx.workloadIndex = make(map[string]PostingList)
	idx.podIndex = make(map[string]PostingList)
	idx.traceIndex.Clear()
	idx.totalEntries = 0
	idx.bucketCount = 0
}

// Stats returns index statistics
func (idx *LogIndex) Stats() IndexStats {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	return IndexStats{
		TotalEntries:   idx.totalEntries,
		TimeBuckets:    idx.bucketCount,
		LevelTerms:     len(idx.levelIndex),
		NamespaceTerms: len(idx.namespaceIndex),
		WorkloadTerms:  len(idx.workloadIndex),
		PodTerms:       len(idx.podIndex),
		TraceTerms:     idx.traceIndex.Size(),
		TraceCapacity:  idx.traceIndex.Capacity(),
	}
}

// IndexStats represents index statistics
type IndexStats struct {
	TotalEntries   int `json:"total_entries"`
	TimeBuckets    int `json:"time_buckets"`
	LevelTerms     int `json:"level_terms"`
	NamespaceTerms int `json:"namespace_terms"`
	WorkloadTerms  int `json:"workload_terms"`
	PodTerms       int `json:"pod_terms"`
	TraceTerms     int `json:"trace_terms"`
	TraceCapacity  int `json:"trace_capacity"`
}

// NewTraceIndexLRU creates a new LRU cache for trace ID lookups
func NewTraceIndexLRU(capacity int) *TraceIndexLRU {
	idx := &TraceIndexLRU{
		capacity: capacity,
		items:    make(map[string]*traceItem),
		order:    &traceNode{}, // sentinel node
	}
	idx.order.next = idx.order
	idx.order.prev = idx.order
	return idx
}

// Add adds an entry index for a trace ID
func (lru *TraceIndexLRU) Add(traceID string, entryIndex int) {
	lru.mu.Lock()
	defer lru.mu.Unlock()

	if item, exists := lru.items[traceID]; exists {
		// Update existing item
		item.indices = append(item.indices, entryIndex)
		lru.moveToFront(item.node)
		return
	}

	// Create new item
	node := &traceNode{key: traceID}
	item := &traceItem{
		indices: []int{entryIndex},
		node:    node,
	}

	lru.items[traceID] = item
	lru.addToFront(node)

	// Evict if over capacity
	if len(lru.items) > lru.capacity {
		lru.evictLRU()
	}
}

// Get retrieves entry indices for a trace ID
func (lru *TraceIndexLRU) Get(traceID string) PostingList {
	lru.mu.Lock()
	defer lru.mu.Unlock()

	if item, exists := lru.items[traceID]; exists {
		lru.moveToFront(item.node)
		return PostingList(item.indices)
	}
	return nil
}

// Size returns the number of trace IDs in the cache
func (lru *TraceIndexLRU) Size() int {
	lru.mu.RLock()
	defer lru.mu.RUnlock()
	return len(lru.items)
}

// Capacity returns the cache capacity
func (lru *TraceIndexLRU) Capacity() int {
	return lru.capacity
}

// Clear removes all entries from the cache
func (lru *TraceIndexLRU) Clear() {
	lru.mu.Lock()
	defer lru.mu.Unlock()

	lru.items = make(map[string]*traceItem)
	lru.order.next = lru.order
	lru.order.prev = lru.order
}

// moveToFront moves a node to the front of the LRU list
func (lru *TraceIndexLRU) moveToFront(node *traceNode) {
	lru.removeNode(node)
	lru.addToFront(node)
}

// addToFront adds a node to the front of the LRU list
func (lru *TraceIndexLRU) addToFront(node *traceNode) {
	node.prev = lru.order
	node.next = lru.order.next
	lru.order.next.prev = node
	lru.order.next = node
}

// removeNode removes a node from the LRU list
func (lru *TraceIndexLRU) removeNode(node *traceNode) {
	node.prev.next = node.next
	node.next.prev = node.prev
}

// evictLRU removes the least recently used item
func (lru *TraceIndexLRU) evictLRU() {
	if lru.order.prev != lru.order {
		node := lru.order.prev
		lru.removeNode(node)
		delete(lru.items, node.key)
	}
}
