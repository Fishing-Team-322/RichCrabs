FROM ubuntu:22.04 AS runtime
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  libssl3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build this binary beforehand via scripts/build-gateway-binary.sh
COPY defay1x9/bin/defay1x9 /app/defay1x9
COPY defay1x9/bin/lib/ /app/lib/
COPY defay1x9/api /app/api

RUN test -x /app/defay1x9 || (echo 'Gateway binary is missing or not executable. Run ./scripts/build-gateway-binary.sh first.' && exit 1)

ENV LD_LIBRARY_PATH=/app/lib
ENV GW_LISTEN_HOST=0.0.0.0
ENV GW_LISTEN_PORT=8080
ENV GW_PUBLIC_BASE_URL=http://localhost:8080
ENV GW_OPENAPI_PATH=./api/openapi.yaml

EXPOSE 8080
CMD ["/app/defay1x9"]
