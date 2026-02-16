#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GermanLearningStack } from '../lib/german-learning-stack';

const app = new cdk.App();
new GermanLearningStack(app, 'GermanLearningStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
