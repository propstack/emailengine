import { StackProps, CfnOutput } from 'aws-cdk-lib';
import * as s24 from '@is24/s24-aws-cdk';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface CommonStackProps extends StackProps {
    repositoryName: string;
}

export class CommonStack extends s24.Stack {
    constructor(scope: Construct, id: string, props: CommonStackProps) {
        super(scope, id, props);

        const ecrRepository = new ecr.Repository(this, `EmailEngineDockerRepositoryEcr`, {
            repositoryName: props.repositoryName
        });

        const lifecycleRules: ecr.LifecycleRule[] = [
            {
                rulePriority: 1,
                description: 'Keep 25 pro images',
                tagStatus: ecr.TagStatus.TAGGED,
                tagPrefixList: ['pro'],
                maxImageCount: 25
            },
            {
                rulePriority: 2,
                description: 'Do not keep images other than tag prefix - pro',
                tagStatus: ecr.TagStatus.ANY,
                maxImageCount: 1
            }
        ];

        lifecycleRules.forEach((lifecycleRule) => ecrRepository.addLifecycleRule(lifecycleRule));

        ecrRepository.addToResourcePolicy(
            new iam.PolicyStatement({
                sid: 'AllowPull',
                effect: iam.Effect.ALLOW,
                principals: [new s24.InfinityIAMPrincipal()],
                actions: ['ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage', 'ecr:BatchCheckLayerAvailability', 'ecr:GetAuthorizationToken']
            })
        );

        new CfnOutput(this, 'EmailEngineEcrRepository', {
            value: ecrRepository.repositoryName,
            description: 'The name of the ECR repository',
            exportName: 'EmailEngineRepositoryName'
        });
    }
}
