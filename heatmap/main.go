package main

import (
	"bytes"

	"github.com/google/pprof/profile"
	"github.com/gopherjs/gopherjs/js"
	"github.com/quasilyte/perf-heatmap/heatmap"
)

var indexes = map[string]*heatmap.Index{}

func main() {
	js.Global.Set("perfheatmap", map[string]interface{}{
		"createIndex":   jsCreateIndex,
		"deleteIndex":   jsDeleteIndex,
		"hasIndex":      jsHasIndex,
		"getFileLevels": jsGetFileLevels,
	})
}

func jsCreateIndex(key string, pprofData []byte, threshold float64) interface{} {
	p, err := profile.Parse(bytes.NewReader(pprofData))
	if err != nil {
		return err.Error()
	}
	config := heatmap.IndexConfig{Threshold: threshold}
	index := heatmap.NewIndex(config)
	if err := index.AddProfile(p); err != nil {
		return err.Error()
	}
	indexes[key] = index
	return nil
}

func jsDeleteIndex(indexKey string) {
	delete(indexes, indexKey)
}

func jsHasIndex(indexKey string) bool {
	_, ok := indexes[indexKey]
	return ok
}

func jsGetFileLevels(indexKey, filename string) interface{} {
	index, ok := indexes[indexKey]
	if !ok {
		return "index with specified key does not exist"
	}
	var result []map[string]interface{}
	index.Inspect(func(stats heatmap.LineStats) {
		if stats.Func.Filename != filename {
			return
		}
		result = append(result, map[string]interface{}{
			"line":        stats.LineNum,
			"localLevel":  stats.HeatLevel,
			"globalLevel": stats.GlobalHeatLevel,
			"value":       float64(stats.Value),
		})
	})
	return result
}
