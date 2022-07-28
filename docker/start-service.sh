#!/bin/bash

echo "Started the entrypoint"

export ENV_PREFIX="${ENV_TYPE^^}_"

getSecretValue() {
    jq -r ".Parameters[] | select(.Name == \"${ENV_PREFIX}$1\") | .Value" secrets.json
}

getSecretValueWithoutEnvPrefix() {
    jq -r ".Parameters[] | select(.Name == \"$1\") | .Value" secrets.json
}

#aws ssm get-parameters --names \
#            "${ENV_PREFIX}EENGINE_REDIS" \
#        --region eu-west-1 --with-decryption > secrets.jsoon

#todo: uncomment after tests
#export EENGINE_REDIS=$(getSecretValue "EENGINE_REDIS")
#rm secrets.json

export ENVIRONMENT production
export NODE_ENV	production

#todo
#export REDIS_DEFAULT_ADDRESS_EXT	3.70.181.188
#export REDIS_DEFAULT_URL_EXT	redis://3.70.181.188:6379

mv ./deploy/nginx.conf /etc/nginx/nginx.conf

echo "Starting Email Engine application"
node /emailengine/server.js & nginx -c /etc/nginx/nginx.conf
