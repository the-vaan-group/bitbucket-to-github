FROM node:14.15.4-buster

ENV NODE_ENV=development \
    SHELL=/bin/bash \
    TMP_DIR=/mnt/tmp \
    WORKDIR=/app

ENV PNPM_VERSION=5.14.3 \
    npm_config_store_dir="${TMP_DIR}/pnpm-store"

ENV PATH="${WORKDIR}/bin:${WORKDIR}/node_modules/.bin:${PATH}"

WORKDIR ${WORKDIR}

COPY bin/pid1 /sbin/pid1

RUN echo "Configuring permissions" \
    && chmod +x /sbin/pid1 \
    && mkdir ${TMP_DIR} \
    && chown -R node:node ${TMP_DIR} ${WORKDIR}

RUN echo "Installing pnpm" \
    && npm install -g "pnpm@${PNPM_VERSION}"

USER node

RUN echo "Customizing shell prompt" \
    && (echo 'export PS1="[DOCKER]:\u@\h:\w\\$ "' >> ~/.bashrc)

ENTRYPOINT ["/sbin/pid1", "--timeout", "10"]
