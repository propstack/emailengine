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
            "${ENV_PREFIX}EENGINE_REDIS" \
        --region eu-west-1 --with-decryption > secrets.json

export EENGINE_REDIS=$(getSecretValue "EENGINE_REDIS")

rm secrets.json

echo "Starting Email Engine application"
node /emailengine/server.js
