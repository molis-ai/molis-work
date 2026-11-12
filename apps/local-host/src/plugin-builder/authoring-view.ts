import type {AgentBuild} from '../installed-plugin-host.js';

type PublicChecks = Record<string, Pick<AgentBuild['checks'][string], 'passed' | 'gates'>>;
type PublicSnapshot = Omit<AgentBuild['history'][number], 'directory' | 'checks'> & { checks?: PublicChecks };

/** Browser projection has no native directory or checked bundle locations. */
export function publicBuild(build:AgentBuild): Omit<AgentBuild, 'directory' | 'history' | 'checks'> & { history: PublicSnapshot[]; checks: PublicChecks } {
 const {directory:_directory,history,checks,...rest}=build;
 const publicChecks=(values:AgentBuild['checks'])=>Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{passed:value.passed,gates:value.gates}]));
 return {...rest,history:history.map(({directory:_path,checks:previous,...item})=>({...item,...(previous?{checks:publicChecks(previous)}:{})})),checks:publicChecks(checks)};
}
export function publicRelease<T extends {directory?:string;bundlePath?:string;packagePath?:string}>(release:T){
 const {directory:_directory,bundlePath:_bundle,packagePath:_package,...rest}=release;return rest;
}
