import { LOCALE_TAG, type UiDefinitionRef, type UiDevicePreferences, type UiEnvironmentProblem, type UiEnvironmentSnapshot, type UiSkinFile, type UiSpecFile, type UiTextDirection } from "@molis-ai/molis-work-contracts/platform/ui";

// What is on show for one page (specs/font-and-skin-system/a-section-contract.md §4). No I/O: the Host and a page run the same function, and a page, which
// reads no files, only merges its device preferences in. The snapshot holds identities and problems, never token values or translations.

/** A snapshot goes into the first-screen HTML, where bytes move to a place nothing measures, so its problems are bounded whatever a Home holds. */
export const UI_ENVIRONMENT_PROBLEM_LIMITS = { count: 8, field: 200 } as const;

export interface UiEnvironmentInput {
  readonly spec: UiSpecFile;
  readonly skin: UiSkinFile;
  /** A font someone chose. Left out, the skin's recommended font: changing the skin then changes the font too. */
  readonly font?: UiDefinitionRef;
  /** A monospace scheme someone chose. Left out, the font in force, whose `code` role already says what code is set in. */
  readonly mono?: UiDefinitionRef;
  readonly locale: {
    readonly tag: string;
    readonly source: UiEnvironmentSnapshot["locale"]["source"];
    /** The language pack's. Left out, `ltr`. */
    readonly direction?: UiTextDirection;
  };
  readonly device?: UiDevicePreferences | null;
  readonly problems?: readonly UiEnvironmentProblem[];
}

const identity = ({ id, revision }: UiDefinitionRef): UiDefinitionRef => ({ id, revision });
const written = ({ id, revision }: UiDefinitionRef): string => `${id}@${revision}`;

/** The full tag for `Intl`: en to en-US, zh to zh-CN. */
function formattingTag(tag: string): string {
  try {
    const { language, region } = new Intl.Locale(tag).maximize();
    return region === undefined ? tag : `${language}-${region}`;
  } catch {
    // The tag is reported as a problem of the snapshot. A page still shows, in whatever `Intl` makes of it.
    return tag;
  }
}

function boundedProblems(problems: readonly UiEnvironmentProblem[]): readonly UiEnvironmentProblem[] {
  const { count, field } = UI_ENVIRONMENT_PROBLEM_LIMITS;
  const short = ({ code, subject, detail }: UiEnvironmentProblem): UiEnvironmentProblem => ({ code: code.slice(0, field), subject: subject.slice(0, field), ...(detail === undefined ? {} : { detail: detail.slice(0, field) }) });
  if (problems.length <= count) return problems.map(short);
  return [...problems.slice(0, count - 1).map(short), { code: "ui.environment_problems_more", subject: "problems", detail: `还有 ${problems.length - count + 1} 条没有列出` }];
}

/** Which skin, font and language are in force. Language changes neither skin nor font, and a skin does not change the language or a chosen font. */
export function resolveUiEnvironment(input: UiEnvironmentInput): UiEnvironmentSnapshot {
  const scheme = identity(input.font ?? input.skin.recommended_font);
  const mono = identity(input.mono ?? scheme);
  const problems = [...(LOCALE_TAG.test(input.locale.tag) ? [] : [{ code: "ui.environment_locale", subject: input.locale.tag }]), ...(input.problems ?? [])];
  const { tag, source, direction = "ltr" } = input.locale;
  return {
    revision: [written(input.spec), written(input.skin), written(scheme), written(mono), tag].join(";"),
    spec: identity(input.spec),
    skin: identity(input.skin),
    font: { scheme, policy: input.font === undefined ? "follow-skin" : "pinned", mono },
    locale: { tag, direction, source, formatting: formattingTag(tag) },
    device: input.device ?? null,
    problems: boundedProblems(problems),
  };
}

/** The server cannot read a device's preferences: a page merges them in. They are not part of `revision`, which says what was chosen. */
export function withDevicePreferences(snapshot: UiEnvironmentSnapshot, device: UiDevicePreferences): UiEnvironmentSnapshot {
  return { ...snapshot, device };
}
