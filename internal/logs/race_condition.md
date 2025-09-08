==================
WARNING: DATA RACE
Read at 0x00c000680ab0 by goroutine 982:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x395
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Previous write at 0x00c000680ab0 by goroutine 974:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x53

Goroutine 982 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 974 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x17d
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
==================
WARNING: DATA RACE
Write at 0x00c000680ab0 by goroutine 982:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Previous write at 0x00c000680ab0 by goroutine 986:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Goroutine 982 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 986 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
==================
WARNING: DATA RACE
Read at 0x00c000680ab0 by goroutine 989:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x395
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x53

Previous write at 0x00c000680ab0 by goroutine 985:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Goroutine 989 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x17d
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 985 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
==================
WARNING: DATA RACE
Read at 0x00c000680ab0 by goroutine 978:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x395
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Previous write at 0x00c000680ab0 by goroutine 988:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Goroutine 978 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 988 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
==================
WARNING: DATA RACE
Write at 0x00c000680ab0 by goroutine 978:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Previous write at 0x00c000680ab0 by goroutine 989:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x53

Goroutine 978 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 989 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x17d
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
{"level":"info","ts":1757375513.0749562,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
==================
WARNING: DATA RACE
Read at 0x00c000680ab0 by goroutine 1026:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x395
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).broadcastSummaryUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:85 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x8f

Previous write at 0x00c000680ab0 by goroutine 1025:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).broadcastSummaryUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:85 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x8f

Goroutine 1026 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x4ee
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).OnUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:44 +0x46
  k8s.io/client-go/tools/cache.(*processorListener).run.func1()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:976 +0x2d4
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:226 +0x41
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:227 +0xc4
  k8s.io/apimachinery/pkg/util/wait.JitterUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:204 +0xfb
  k8s.io/apimachinery/pkg/util/wait.Until()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:161 +0x9b
  k8s.io/client-go/tools/cache.(*processorListener).run()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:972 +0x38
  k8s.io/client-go/tools/cache.(*processorListener).run-fm()
      <autogenerated>:1 +0x33
  k8s.io/apimachinery/pkg/util/wait.(*Group).Start.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/wait.go:72 +0x86

Goroutine 1025 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x4ee
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).OnUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:44 +0x46
  k8s.io/client-go/tools/cache.(*processorListener).run.func1()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:976 +0x2d4
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:226 +0x41
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:227 +0xc4
  k8s.io/apimachinery/pkg/util/wait.JitterUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:204 +0xfb
  k8s.io/apimachinery/pkg/util/wait.Until()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:161 +0x9b
  k8s.io/client-go/tools/cache.(*processorListener).run()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:972 +0x38
  k8s.io/client-go/tools/cache.(*processorListener).run-fm()
      <autogenerated>:1 +0x33
  k8s.io/apimachinery/pkg/util/wait.(*Group).Start.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/wait.go:72 +0x86
==================
==================
WARNING: DATA RACE
Write at 0x00c000680ab0 by goroutine 1046:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).broadcastSummaryUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:85 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x8f

Previous write at 0x00c000680ab0 by goroutine 1045:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:37 +0x3b3
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).broadcastSummaryUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:85 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x8f

Goroutine 1046 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x4ee
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).OnUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:44 +0x46
  k8s.io/client-go/tools/cache.(*processorListener).run.func1()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:976 +0x2d4
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:226 +0x41
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:227 +0xc4
  k8s.io/apimachinery/pkg/util/wait.JitterUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:204 +0xfb
  k8s.io/apimachinery/pkg/util/wait.Until()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:161 +0x9b
  k8s.io/client-go/tools/cache.(*processorListener).run()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:972 +0x38
  k8s.io/client-go/tools/cache.(*processorListener).run-fm()
      <autogenerated>:1 +0x33
  k8s.io/apimachinery/pkg/util/wait.(*Group).Start.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/wait.go:72 +0x86

Goroutine 1045 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x4ee
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).OnUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:44 +0x46
  k8s.io/client-go/tools/cache.(*processorListener).run.func1()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:976 +0x2d4
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:226 +0x41
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:227 +0xc4
  k8s.io/apimachinery/pkg/util/wait.JitterUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:204 +0xfb
  k8s.io/apimachinery/pkg/util/wait.Until()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:161 +0x9b
  k8s.io/client-go/tools/cache.(*processorListener).run()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:972 +0x38
  k8s.io/client-go/tools/cache.(*processorListener).run-fm()
      <autogenerated>:1 +0x33
  k8s.io/apimachinery/pkg/util/wait.(*Group).Start.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/wait.go:72 +0x86
==================
{"level":"info","ts":1757375518.0752854,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
{"level":"info","ts":1757375523.0744445,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
{"level":"info","ts":1757375528.074431,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
{"level":"info","ts":1757375533.0743744,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
{"level":"info","ts":1757375538.0751836,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
==================
WARNING: DATA RACE
Read at 0x00c000680aa8 by goroutine 1535:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:46 +0x1a5
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x53

Previous write at 0x00c000680aa8 by goroutine 1551:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:46 +0x1c4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Goroutine 1535 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x17d
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 1551 (finished) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
==================
WARNING: DATA RACE
Write at 0x00c000680aa8 by goroutine 1535:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:46 +0x1c4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x53

Previous write at 0x00c000680aa8 by goroutine 1550:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:46 +0x1c4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).precomputeSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:266 +0xcc
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x6b

Goroutine 1535 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:251 +0x17d
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33

Goroutine 1550 (finished) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).refreshCriticalSummaries()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:256 +0x256
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).backgroundRefreshLoop()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:240 +0xc4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).StartBackgroundProcessing.gowrap2()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:126 +0x33
==================
{"level":"info","ts":1757375543.0751915,"logger":"background-collector","caller":"logs/background_collector.go:130","msg":"Discovering pods for log collection","component":"logs-cache","version":"1.0.0"}
==================
WARNING: DATA RACE
Read at 0x00c000680aa8 by goroutine 1660:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:46 +0x1a5
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).broadcastSummaryUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:85 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x8f

Previous write at 0x00c000680aa8 by goroutine 1659:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*Cache).Get()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/cache.go:46 +0x1c4
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryService).GetResourceSummary()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/service.go:69 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).broadcastSummaryUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:85 +0x104
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange.gowrap1()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x8f

Goroutine 1660 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x4ee
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).OnUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:44 +0x46
  k8s.io/client-go/tools/cache.(*processorListener).run.func1()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:976 +0x2d4
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:226 +0x41
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:227 +0xc4
  k8s.io/apimachinery/pkg/util/wait.JitterUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:204 +0xfb
  k8s.io/apimachinery/pkg/util/wait.Until()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:161 +0x9b
  k8s.io/client-go/tools/cache.(*processorListener).run()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:972 +0x38
  k8s.io/client-go/tools/cache.(*processorListener).run-fm()
      <autogenerated>:1 +0x33
  k8s.io/apimachinery/pkg/util/wait.(*Group).Start.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/wait.go:72 +0x86

Goroutine 1659 (running) created at:
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).handleResourceChange()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:75 +0x4ee
  github.com/aaronlmathis/kaptn/internal/k8s/summaries.(*SummaryEventHandler).OnUpdate()
      /home/amathis/workspace/kaptn/internal/k8s/summaries/events.go:44 +0x46
  k8s.io/client-go/tools/cache.(*processorListener).run.func1()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:976 +0x2d4
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:226 +0x41
  k8s.io/apimachinery/pkg/util/wait.BackoffUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:227 +0xc4
  k8s.io/apimachinery/pkg/util/wait.JitterUntil()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:204 +0xfb
  k8s.io/apimachinery/pkg/util/wait.Until()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/backoff.go:161 +0x9b
  k8s.io/client-go/tools/cache.(*processorListener).run()
      /home/amathis/go/pkg/mod/k8s.io/client-go@v0.30.6/tools/cache/shared_informer.go:972 +0x38
  k8s.io/client-go/tools/cache.(*processorListener).run-fm()
      <autogenerated>:1 +0x33
  k8s.io/apimachinery/pkg/util/wait.(*Group).Start.func1()
      /home/amathis/go/pkg/mod/k8s.io/apimachinery@v0.30.6/pkg/util/wait/wait.go:72 +0x86
==================