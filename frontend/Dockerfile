FROM node:24-alpine AS styles

WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY tailwind.config.js styles.input.css .
COPY *.html *.js ./
RUN npm run build

FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
COPY --from=styles /build/styles.css /usr/share/nginx/html/styles.css

EXPOSE 80
