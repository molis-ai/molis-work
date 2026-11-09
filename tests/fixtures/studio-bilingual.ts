import { freezeStudioUi, type AgentDesign } from '@molis-ai/molis-work-plugin-builder';

export const studioTestLanguages = { current: 'zh', available: [{ tag: 'zh', name: '简体中文' }, { tag: 'en', name: 'English' }] };
export const studioBilingualAnswer = () => ({ default: 'zh', locales: {
  zh: { 'plugin/name': '读书摘记', 'page/home/title': '摘记', 'region/home/main/title': '摘记工作区',
    'part/title/title': '读书摘记', 'part/editor/submitLabel': '保存摘记', 'field/notes.add/text/label': '摘录正文',
    'field/notes.add/text/hint': '保留引文', 'field/notes.add/access/label': '可见范围', 'column/notes/access/label': '可见范围',
    'column/notes/access/value/personal': '个人', 'column/notes/access/value/team': '小组' },
  en: { 'plugin/name': 'Reading notes', 'page/home/title': 'Notes', 'region/home/main/title': 'Notes workspace',
    'part/title/title': 'Reading notes', 'part/editor/submitLabel': 'Save excerpt', 'field/notes.add/text/label': 'Excerpt text',
    'field/notes.add/text/hint': 'Keep the quotation', 'field/notes.add/access/label': 'Visibility', 'column/notes/access/label': 'Visibility',
    'column/notes/access/value/personal': 'Personal', 'column/notes/access/value/team': 'Team' },
} });

export function prepareStudioNoteWords(design: AgentDesign): AgentDesign {
  const [list, add] = design.contract.operations;
  const input = add!.input, row = list!.output.items!;
  const access = { type: 'string' as const, enum: ['personal', 'team'] };
  input.properties!.text!.description = '摘录，保留引文';
  input.properties!.access = { ...access, description: '可见范围' };
  row.properties!.access = access;
  design.parts.find(part => part.id === 'notes')!.props.columns = [
    { field: 'access', label: '可见范围', values: { personal: '个人', team: '小组' } },
  ];
  design.parts.find(part => part.id === 'editor')!.submit!.input.access = { source: 'form', field: 'access' };
  design.contract.acceptance = [{ id: 'save', description: 'Saves an excerpt', steps: [{ description: 'Read notes', operationId: 'notes.list', input: {}, expected: 'A list of notes' }] }];
  design.acceptance = [{ id: 'save', description: 'Reads the dedicated heading', steps: [{ action: 'expectWord', componentId: 'title', word: 'title' }] }];
  return design;
}

export const studioBilingualNotes = (design: AgentDesign) => freezeStudioUi(prepareStudioNoteWords(design), studioBilingualAnswer(), studioTestLanguages);
