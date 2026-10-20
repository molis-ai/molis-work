import { LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import type { ProjectRecord } from '@molis-ai/molis-work-contracts/modules/projects';
import type { ProjectsModule } from '@molis-ai/molis-work-module-projects';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { ManagedProjectFiles } from './managed-project-files.js';
import type { CreateMolisWorkProjectInput } from './project-catalog-contract.js';
import { PERSONAL_SPACE_PROJECT_ID, PERSONAL_SPACE_TITLE } from './personal-space.js';

/** Provisions managed partitions; account ownership and remote paths never come from a sync payload. */
export class PersonalProjectProvisioner {
  constructor(private readonly home: string, private readonly files: ManagedProjectFiles, private readonly projects: ProjectsModule) {}

  async ensurePersonalSpace(actorId = LOCAL_PERSON_ACTOR_ID, beforeEffect: () => void = () => {}): Promise<ProjectRecord> {
    beforeEffect();
    const existing = this.projects.query.listProjects().find(row => row.project_id === PERSONAL_SPACE_PROJECT_ID);
    if (existing) return existing;
    try {
      const record = await this.files.provisionCreatedProject({ displayName: PERSONAL_SPACE_TITLE, actorId, projectId: PERSONAL_SPACE_PROJECT_ID }, record => {
        beforeEffect();
        this.projects.lifecycle.register(record, 'project.created', actorId);
        return record;
      });
      beforeEffect();
      return record;
    } catch (error) {
      beforeEffect();
      const made = this.projects.query.listProjects().find(row => row.project_id === PERSONAL_SPACE_PROJECT_ID);
      if (made) return made;
      throw error;
    }
  }

  /** Prepare missing original files while the existing tombstone continues hiding the project. No lifecycle state change. */
  async prepareSyncedProjectRestore(input: CreateMolisWorkProjectInput, beforeEffect: () => void): Promise<ProjectRecord> {
    beforeEffect();
    if (ensureStorageSpace(this.home).kind !== 'personal' || !input.project_id || !this.projects.recycle.isRecycled(input.project_id)
      || this.projects.query.listProjectDeletions().some(row => row.project_id === input.project_id)) throw new Error('此项目不能准备同步恢复');
    try { this.projects.recycle.inspect(input.project_id); throw new Error('项目原件已存在，无需准备恢复'); }
    catch(error) { if(!error || typeof error!=='object' || !('code' in error) || error.code!=='catalog.recycle_missing')throw error; }
    const record=await this.files.createProject(input,true,beforeEffect);beforeEffect();return record;
  }

  async ensureSyncedProject(input: CreateMolisWorkProjectInput, beforeEffect: () => void): Promise<ProjectRecord> {
    beforeEffect();
    if (ensureStorageSpace(this.home).kind !== 'personal') throw new Error('SYNC_PERSONAL_SPACE_REQUIRED');
    if (this.projects.recycle.isRecycled(input.project_id ?? '') || this.projects.query.listProjectDeletions().some(row => row.project_id === input.project_id)) throw new Error('已删除的项目不会通过同步自动恢复');
    if (input.project_id === PERSONAL_SPACE_PROJECT_ID) return this.ensurePersonalSpace(input.actor_id, beforeEffect);
    return this.files.createProject(input, true, beforeEffect);
  }
}
