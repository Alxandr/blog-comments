import * as apigw from "@aws-cdk/aws-apigateway";
import * as cdk from "@aws-cdk/core";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as lambda from "@aws-cdk/aws-lambda";
import * as origins from "@aws-cdk/aws-cloudfront-origins";

import { Duration } from "@aws-cdk/core";

const RUST_TARGET = "x86_64-unknown-linux-musl";

const rustLambda = (pkg: string) =>
  lambda.Code.fromAsset(".", {
    bundling: {
      command: [
        "bash",
        "-c",
        `cargo build --release --target '${RUST_TARGET}' --package '${pkg}' --bin '${pkg}' && cp 'target/${RUST_TARGET}/release/${pkg}' /asset-output/bootstrap`,
      ],
      image: cdk.DockerImage.fromBuild(".", {
        file: "builder.Dockerfile",
        buildArgs: {
          RUST_TARGET,
        },
      }),
    },
  });

class ApiGatewayOrigin extends origins.HttpOrigin {
  constructor(gw: apigw.RestApi) {
    const apiEndPointUrlWithoutProtocol = cdk.Fn.select(
      1,
      cdk.Fn.split("://", gw.url)
    );
    const apiEndPointDomainName = cdk.Fn.select(
      0,
      cdk.Fn.split("/", apiEndPointUrlWithoutProtocol)
    );

    super(apiEndPointDomainName, {
      originPath: `/${gw.deploymentStage.stageName}`,
    });
  }
}

export class BlogCommentsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const helloLambda = new lambda.Function(this, "HelloHandler", {
      code: rustLambda("hello"),
      functionName: "hello",
      handler: "main",
      runtime: lambda.Runtime.PROVIDED_AL2,
    });

    const helloHttpLambda = new lambda.Function(this, "HelloHttpHandler", {
      code: rustLambda("hello-http"),
      functionName: "hello-http",
      handler: "main",
      runtime: lambda.Runtime.PROVIDED_AL2,
    });

    const gw = new apigw.RestApi(this, "BlogCommentsEndpoint");
    gw.root
      .addResource("hello")
      .addMethod("GET", new apigw.LambdaIntegration(helloHttpLambda));

    const cf = new cloudfront.Distribution(this, "blog-comments", {
      defaultBehavior: {
        origin: new ApiGatewayOrigin(gw),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: new cloudfront.CachePolicy(
          this,
          "BlogCommentsCachePolicy",
          {
            defaultTtl: Duration.minutes(5),
            minTtl: Duration.minutes(1),
            maxTtl: Duration.days(1),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior:
              cloudfront.CacheQueryStringBehavior.allowList("name"),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }
        ),
      },
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: `https://${cf.distributionDomainName}/`,
    });
  }
}
