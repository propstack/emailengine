import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s24 from '@is24/s24-aws-cdk';
import { aws_iam, CfnOutput, Fn, StackProps, Environment } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface ServiceStackProps extends StackProps {
    imageTag: string;
    stage: string;
    env: Environment;
}

export class ServiceStack extends s24.Stack {
    constructor(scope: Construct, id: string, props: ServiceStackProps) {
        super(scope, id, props);

        // reference to ecr
        const ecrRepositoryName = Fn.importValue('EmailEngineRepositoryName');
        const ecrRepository = ecr.Repository.fromRepositoryName(this, 'EmailEngineRepositoryName', ecrRepositoryName);

        // infinity
        this.createInfinityResource(props, ecrRepository)
    }

    private getInfinityStatements(props: ServiceStackProps): aws_iam.PolicyStatement[] {
        const commonStatements = [
            // fetching secrets from Parameter Store
            new aws_iam.PolicyStatement({
                effect: aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameters'],
                resources: [`arn:aws:ssm:${props.env.region}:${props.env.account}:parameter/*`],
            })
        ];

        if (props.stage === 'pro') {
            return commonStatements.concat([
                new aws_iam.PolicyStatement({
                    effect: aws_iam.Effect.ALLOW,
                    actions: ['logs:PutLogEvents', 'logs:CreateLogGroup', 'logs:CreateLogStream'],
                    resources: ['*'],
                }),
                // original policy name: CloudWatchMetricsPutLogEvents
                new aws_iam.PolicyStatement({
                    effect: aws_iam.Effect.ALLOW,
                    actions: ['logs:PutLogEvents', 'logs:CreateLogGroup', 'logs:CreateLogStream'],
                    resources: ['*'],
                }),
                // original policy name: CloudWatchMetricsPutMetricData 
                new aws_iam.PolicyStatement({
                    effect: aws_iam.Effect.ALLOW,
                    actions: ['cloudwatch:PutMetricData'],
                    resources: ['*'],
                })
            ]);
        }
        return commonStatements;
    }

    private createInfinityResource(
        props: ServiceStackProps,
        ecrRepository: ecr.IRepository,
    ) {
        const service = new s24.InfinityService(this, `EmailEngineInfinityService`, {
            serviceName: this.withStage(`email-engine`),
            containerPort: 3000,
            healthCheckPath: '/health',
            image: s24.ContainerImage.fromEcrRepository(ecrRepository, props.imageTag),
            minCapacity: props.stage === 'pro' ? 2 : 1,
            cpu: 2048,
            memory: 4096,
            unhealthyThresholdCount: 5,
            containerEnvironment: {
                ENV_TYPE: props.stage,
                NODE_OPTIONS: "--max-old-space-size=3584 --require /usr/lib/node_modules/dd-trace/init",
                REQUEST_TIMEOUT: '12000',
                THREAD_TIMEOUT: '300000'
            },
            role: new s24.InfinityServiceRole(
                this, `InfinityServiceRole`, {
                    roleName: this.withStage(`email-engine-infinity-role`),
                    assumedBy: new s24.InfinityIAMPrincipal(),
                    inlinePolicies: {
                        [`InfinityPolicy`]: new aws_iam.PolicyDocument({
                            statements: this.getInfinityStatements(props),
                        }),
                    },
                },
            ),
        });

        new CfnOutput(this, `ServiceAddress`, {
            value: service.dnsName ?? ''
        });

        new CfnOutput(this, `ServiceName`, {
            value: service.serviceName,
            description: 'Full Infinity service name'
        });
    }
}
