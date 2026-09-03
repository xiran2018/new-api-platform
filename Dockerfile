FROM oven/bun:1.4.0 AS web-builder

WORKDIR /build/web
COPY core/new-api/web/package.json core/new-api/web/bun.lock ./
RUN bun install --frozen-lockfile
COPY core/new-api/web/ ./
COPY extensions/frontend/ ./src/platform/
COPY core/new-api/VERSION /build/VERSION
RUN DISABLE_ESLINT_PLUGIN=true VITE_REACT_APP_VERSION="$(cat /build/VERSION)" bun run build

FROM golang:1.26.1-alpine AS app-builder

ENV CGO_ENABLED=0 GO111MODULE=on GOWORK=off GOEXPERIMENT=greenteagc
ARG TARGETOS=linux
ARG TARGETARCH
ENV GOOS=${TARGETOS} GOARCH=${TARGETARCH}

WORKDIR /build
COPY core/new-api/go.mod core/new-api/go.sum ./
COPY core/new-api/relaykit/go.mod ./relaykit/go.mod
RUN go mod download
COPY core/new-api/ ./
COPY extensions/backend/ ./platform/
COPY --from=web-builder /build/web/dist ./web/dist
RUN go build -trimpath -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o /new-api .

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata wget \
    && rm -rf /var/lib/apt/lists/*
COPY --from=app-builder /new-api /new-api
COPY core/new-api/LICENSE core/new-api/NOTICE core/new-api/THIRD-PARTY-LICENSES.md /licenses/

WORKDIR /data
EXPOSE 7000
ENTRYPOINT ["/new-api"]

