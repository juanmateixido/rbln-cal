FROM node:20-alpine AS build

WORKDIR /calcom

RUN set -eux;
RUN ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV USE_POOL="true"

COPY . .

RUN --mount=type=secret,id=rbln_build_fixtures,required=true . /run/secrets/rbln_build_fixtures && yarn install
RUN --mount=type=secret,id=rbln_build_fixtures,required=true . /run/secrets/rbln_build_fixtures && yarn workspace @calcom/api-v2 run generate-schemas
RUN --mount=type=secret,id=rbln_build_fixtures,required=true . /run/secrets/rbln_build_fixtures && yarn workspace @calcom/api-v2 run build:docker
RUN --mount=type=secret,id=rbln_build_fixtures,required=true . /run/secrets/rbln_build_fixtures && yarn workspace @calcom/api-v2 run build

EXPOSE 80

CMD [ "yarn", "workspace", "@calcom/api-v2", "start:prod"]
