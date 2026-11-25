FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /workspace
RUN npm install --global pnpm@12.9.1
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/telemetry/package.json apps/telemetry/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/permissions/package.json packages/permissions/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm --filter rental-management --filter @rental/web... --filter @rental/api... --filter @rental/worker... --filter @rental/telemetry-service... install --frozen-lockfile
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN pnpm exec turbo run build --concurrency=2 --filter=@rental/web --filter=@rental/api --filter=@rental/worker --filter=@rental/telemetry-service
RUN pnpm --filter=@rental/api deploy --prod /out/api \
 && pnpm --filter=@rental/worker deploy --prod /out/worker \
 && pnpm --filter=@rental/telemetry-service deploy --prod /out/telemetry \
 && pnpm --filter=@rental/database deploy /out/migrator

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --chown=node:node infrastructure/deployment/entrypoint.mjs /entrypoint.mjs
USER node
ENTRYPOINT ["node", "/entrypoint.mjs"]

FROM runtime AS api
COPY --from=build --chown=node:node /out/api/ ./
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3001/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["dist/main.js"]

FROM runtime AS web
ENV HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone/ ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=build --chown=node:node /workspace/apps/web/public/ ./apps/web/public/
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["apps/web/server.js"]

FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker/ ./
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:3003/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["dist/main.js"]

FROM runtime AS telemetry
COPY --from=build --chown=node:node /out/telemetry/ ./
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["dist/main.js"]

FROM runtime AS migrator
COPY --from=build --chown=node:node /out/migrator/ ./
COPY --chown=node:node infrastructure/deployment/database.mjs ./operations/database.mjs
CMD ["operations/database.mjs", "deploy"]
