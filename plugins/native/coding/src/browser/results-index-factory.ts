import { mountResultsIndex, type ResultsIndexPorts } from './results-index.js';

/** The build wraps this entry in `(ports) => { … }`, embedded in Coding's existing client asset. */
declare const ports: ResultsIndexPorts;
mountResultsIndex(ports);
