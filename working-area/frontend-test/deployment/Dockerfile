# Static frontend (Daily Ledger) — no build step, no runtime deps.
# Serves the static files with nginx on port 8080 (PORT-friendly for
# Railway / Render / Fly.io).
FROM nginx:1.27-alpine

# Remove default site and drop our config in place
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the static app
COPY frontend/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
