# SKYTRACE frontend (Next.js). Build from frontend/:
#   docker build -t skytrace-web --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.your-site --build-arg NEXT_PUBLIC_SITE_URL=https://your-site .
#   docker run -p 3000:3000 skytrace-web
# NEXT_PUBLIC_* values are baked in at build time: rebuild when the API address changes.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
