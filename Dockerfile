FROM 728137396354.dkr.ecr.eu-west-1.amazonaws.com/s24-base-nodejs16

ENV STACK_PATH=/emailengine

RUN yum install -y awscli jq && \
    yum clean all && \
    yum autoremove -y

RUN amazon-linux-extras install nginx1 -y

WORKDIR $STACK_PATH
COPY . .

RUN npm install --production

EXPOSE 3000
EXPOSE 80

CMD ["sh", "/emailengine/docker/start-service.sh"]