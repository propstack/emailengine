import * as s24 from '@is24/s24-aws-cdk';
import { CommonStack } from '../lib/common-stack';
import { ServiceStack } from '../lib/service-stack';

const app = new s24.App({
    segment: 'propstack'
});

if (app.metadata.stage === 'glo') {
    new CommonStack(app, 'email-engine-common-stack', {
        env: {
            account: `${app.node.tryGetContext('account')}`,
            region: 'eu-west-1'
        },

        repositoryName: `${app.node.tryGetContext('repositoryName')}`,
    });
}

if (['stg', 'pro'].includes(app.metadata.stage)) {
    // stage prefix is not needed as it's added automatically later on by Scout's SDK
    new ServiceStack(app, `email-engine-service-stack`, {
        env: {
            account: `${app.node.tryGetContext('account')}`,
            region: 'eu-west-1'
        },
        stage: `${app.node.tryGetContext('stage')}`,
        imageTag: `${app.node.tryGetContext('imageTag')}`
    });
}
