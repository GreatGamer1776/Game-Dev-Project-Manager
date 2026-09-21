FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache openssl
COPY --from=build /app/dist /usr/share/nginx/html
# Rendered by the nginx entrypoint (envsubst) — ${HTTPS_PORT} is substituted.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/40-selfsigned-cert.sh /docker-entrypoint.d/40-selfsigned-cert.sh
RUN chmod +x /docker-entrypoint.d/40-selfsigned-cert.sh
ENV HTTPS_PORT=8443
EXPOSE 80 443
