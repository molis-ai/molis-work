import type {AgentBuild} from '../installed-plugin-host.js';

/** Browser projection has no native directory or checked bundle locations. */
export function publicBuild(build:AgentBuild){
 const {directory:_directory,history,checks,...rest}=build;
 const publicChecks=(values:AgentBuild['checks'])=>Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{passed:value.passed,gates:value.gates}]));
 return {...rest,history:history.map(({directory:_path,checks:previous,...item})=>({...item,...(previous?{checks:publicChecks(previous)}:{})})),checks:publicChecks(checks)};
}
export function publicRelease<T extends {directory?:string;bundlePath?:string;packagePath?:string}>(release:T){
 const {directory:_directory,bundlePath:_bundle,packagePath:_package,...rest}=release;return rest;
}
