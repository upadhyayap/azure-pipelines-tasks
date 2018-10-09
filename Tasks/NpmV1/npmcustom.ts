import * as tl from 'vsts-task-lib/task';

import { NpmTaskInput, RegistryLocation } from './constants';
import { INpmRegistry, NpmRegistry } from 'npm-common/npmregistry';
import { NpmToolRunner } from './npmtoolrunner';
import * as util from 'npm-common/util';
import { PackagingLocation } from 'utility-common/packaging/locationUtilities';

export async function run(packagingLocation: PackagingLocation, command?: string): Promise<void> {
    const workingDir = tl.getInput(NpmTaskInput.WorkingDir) || process.cwd();
    const npmrc = util.getTempNpmrcPath();
    const npmRegistries: INpmRegistry[] = await getCustomRegistries(packagingLocation);
    const overrideNpmrc = (tl.getInput(NpmTaskInput.CustomRegistry) === RegistryLocation.Feed) ? true : false;

    for (const registry of npmRegistries) {
        if (registry.authOnly === false) {
            tl.debug(tl.loc('UsingRegistry', registry.url));
            util.appendToNpmrc(npmrc, `registry=${registry.url}\n`);
        }

        tl.debug(tl.loc('AddingAuthRegistry', registry.url));
        util.appendToNpmrc(npmrc, `${registry.auth}\n`);
    }

    const npm = new NpmToolRunner(workingDir, npmrc, overrideNpmrc);
    npm.line(command || tl.getInput(NpmTaskInput.CustomCommand, true));

    npm.execSync();

    tl.rmRF(npmrc);
    tl.rmRF(util.getTempPath());
}

export async function getCustomRegistries(packagingLocation: PackagingLocation): Promise<NpmRegistry[]> {
    const workingDir = tl.getInput(NpmTaskInput.WorkingDir) || process.cwd();
    const npmRegistries: INpmRegistry[] = await util.getLocalNpmRegistries(workingDir, packagingLocation.PackagingUris);
    const registryLocation = tl.getInput(NpmTaskInput.CustomRegistry);
    switch (registryLocation) {
        case RegistryLocation.Feed:
            tl.debug(tl.loc('UseFeed'));
            const feedId = tl.getInput(NpmTaskInput.CustomFeed, true);
            npmRegistries.push(await NpmRegistry.FromFeedId(packagingLocation.DefaultPackagingUri, feedId));
            break;
        case RegistryLocation.Npmrc:
            tl.debug(tl.loc('UseNpmrc'));
            const endpointIds = tl.getDelimitedInput(NpmTaskInput.CustomEndpoint, ',');
            if (endpointIds && endpointIds.length > 0) {
                await Promise.all(endpointIds.map(async e => {
                    npmRegistries.push(await NpmRegistry.FromServiceEndpoint(e, true));
                }));
            }
            break;
    }
    return npmRegistries;
}