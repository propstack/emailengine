loadLibrary('is24-backend-jenkins-shared-library@cdk-support')

pipeline {
    agent { node { label "build-node14" } }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        AWS_DEFAULT_REGION = 'eu-west-1'
        AWS_DEFAULT_ACCOUNT = '936421802315'

        ECR_REPOSITORY_NAME = 'email-engine-ecr'

        PROJECT_NAME = 'propstack-emailengine'

//         MAIN_BRANCH = 'propstack'
        MAIN_BRANCH = 'feature/propstack-aws'

        GIT_COMMIT = """${sh(returnStdout: true, script: "git rev-parse HEAD").trim()}"""

        DOCKER_IMAGE_PREFIX = 'pro'

        FAST_HTTPAUTH = getFastHttpAuth()
        FAST_EMAIL = getFastEmail()
    }

    stages {
        stage('Prerequisites') {
            when {
                beforeAgent true
                branch env.MAIN_BRANCH
            }

            agent { node { label "deploy-node14" } }

            steps {
                cdkInstall()
                cdk('glo')
            }
        }

        stage('Build') {
            parallel {
                stage('Docker build') {
                    when {
                        beforeAgent true
                        branch env.MAIN_BRANCH
                    }

                    agent { node { label "build-node14" } }

                    steps {
                        ecrLogin()
                        dockerBuildPush(
                            additionalParameters: "--no-cache",
                            repo: env.ECR_REPOSITORY_NAME,
                            tags: ["${env.DOCKER_IMAGE_PREFIX}-${env.GIT_COMMIT}", "${env.DOCKER_IMAGE_PREFIX}-latest"],
                            addBuildNumber: false,
                            defaultBranch: env.BRANCH_NAME,
                        )
                    }
                }

                stage('Static analysis') {
                    agent { node { label "build-node14" } }

                    steps {
                        runSecurityCodeScan(gitHubRepo: "Scout24/${env.PROJECT_NAME}", languages: ['javascript'], rules: 'security-and-quality')
                    }
                }
            }
        }

        stage('Deploy') {
            agent { node { label "deploy-node14" } }

            stages {
                stage ("Install cdk") {
                    when {
                        beforeAgent true
                        branch env.MAIN_BRANCH
                    }

                    steps {
                        cdkInstall()
                    }
                }

                stage('Deploy stg') {
                    when {
                        beforeAgent true
                        branch env.MAIN_BRANCH
                    }

                    steps {
                        cdk('stg')
                    }
                }

                stage('Sync PRO confirmation') {
                    when {
                        beforeAgent true
                        branch env.MAIN_BRANCH
                    }

                    steps {
                        script {
                            PRO_DEPLOYMENT = input(
                                id: 'Proceed', message: 'Pro deployment', parameters: [
                                [$class: 'BooleanParameterDefinition', defaultValue: true, description: '', name: 'Select checkbox to accept production deployment']
                            ])
                        }
                    }
                }

                stage('Sync PRO') {
                    when {
                        beforeAgent true
                        branch env.MAIN_BRANCH
                        expression { PRO_DEPLOYMENT.toBoolean() == true }
                    }

                    steps {
                        cdk('pro')
                    }
                }
            }
        }
    }
}

def cdk(stage) {
    dir('deploy/cdk') {
        sh("npm run cdk deploy -- --require-approval never --context stage=${stage} --context account=${env.AWS_DEFAULT_ACCOUNT} --context imageTag=${env.DOCKER_IMAGE_PREFIX}-${env.GIT_COMMIT} --context repositoryName=${env.ECR_REPOSITORY_NAME}")
    }
}

def cdkInstall() {
    dir('deploy/cdk') {
        sh("npm ci")
    }
}
