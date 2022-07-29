#!/bin/bash

echo "Started the entrypoint"

export ENV_PREFIX="${ENV_TYPE^^}_"

getSecretValue() {
    jq -r ".Parameters[] | select(.Name == \"${ENV_PREFIX}$1\") | .Value" secrets.json
}

getSecretValueWithoutEnvPrefix() {
    jq -r ".Parameters[] | select(.Name == \"$1\") | .Value" secrets.json
}

aws ssm get-parameters --names \
            "${ENV_PREFIX}EMAIL_ENGINE_REDIS_HOST" \
            "${ENV_PREFIX}EMAIL_ENGINE_REDIS_PORT" \
        --region eu-west-1 --with-decryption > secrets.json

export EMAIL_ENGINE_REDIS_HOST=$(getSecretValue "EMAIL_ENGINE_REDIS_HOST")
export EMAIL_ENGINE_REDIS_PORT=$(getSecretValue "EMAIL_ENGINE_REDIS_PORT")
rm secrets.json

export EENGINE_REDIS="rediss://$EMAIL_ENGINE_REDIS_HOST:$EMAIL_ENGINE_REDIS_PORT/2"
echo "$EENGINE_REDIS"
export ENVIRONMENT="production"
export NODE_ENV="production"

echo "Starting Email Engine application"
node /emailengine/server.js
