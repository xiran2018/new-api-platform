package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	port := envOrDefault("PLATFORM_GATEWAY_PORT", "11115")
	upstreamURL, err := url.Parse(envOrDefault("PLATFORM_GATEWAY_UPSTREAM", "http://127.0.0.1:7000"))
	if err != nil {
		log.Fatal(err)
	}
	assetDir := envOrDefault("PLATFORM_HOMEPAGE_DIR", "../homepage")
	absAssetDir, err := filepath.Abs(assetDir)
	if err != nil {
		log.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(upstreamURL)
	originalDirector := proxy.Director
	proxy.Director = func(request *http.Request) {
		originalDirector(request)
		request.Header.Set("X-Forwarded-Host", request.Host)
		request.Header.Set("X-Forwarded-Proto", forwardedProto(request))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/" {
			serveAsset(absAssetDir, "index.html", response, request)
			return
		}
		proxy.ServeHTTP(response, request)
	})
	mux.HandleFunc("/home-assets/", func(response http.ResponseWriter, request *http.Request) {
		name := strings.TrimPrefix(request.URL.Path, "/home-assets/")
		if name == "" || strings.Contains(name, "..") {
			http.NotFound(response, request)
			return
		}
		serveAsset(absAssetDir, name, response, request)
	})

	log.Printf("platform gateway listening on :%s; proxying application traffic to %s", port, upstreamURL)
	log.Fatal(http.ListenAndServe(":"+port, requestLogging(mux)))
}

func serveAsset(assetDir string, name string, response http.ResponseWriter, request *http.Request) {
	file, err := os.Open(filepath.Join(assetDir, name))
	if err != nil {
		http.NotFound(response, request)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(response, request)
		return
	}
	if name != "index.html" {
		response.Header().Set("Cache-Control", "public, max-age=604800")
	} else {
		response.Header().Set("Cache-Control", "no-cache")
	}
	http.ServeContent(response, request, name, info.ModTime(), file)
}

func requestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		next.ServeHTTP(response, request)
	})
}

func forwardedProto(request *http.Request) string {
	if request.TLS != nil {
		return "https"
	}
	return "http"
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
