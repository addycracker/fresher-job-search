FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY apps ./apps
COPY config ./config
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist/apps/job-ingestion ./dist/apps/job-ingestion
COPY --from=build /app/dist/src ./dist/src
COPY --from=build /app/dist/config ./dist/config
USER node
CMD ["node", "dist/apps/job-ingestion/src/index.js", "--write"]
