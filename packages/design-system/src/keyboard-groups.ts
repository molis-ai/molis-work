/** Semantic groups and their items: the runtime and keyboard audits use the same selectors. */
export const KEYBOARD_GROUP_ITEMS = {
  tablist: "[role=tab]", radiogroup: "[role=radio]", menu: "[role^=menuitem]", menubar: "[role^=menuitem]", listbox: "[role=option]",
  toolbar: "button, [role=button], [role=checkbox], [role=radio], [role=switch], a[href], select, input, [tabindex]",
} as const;
export const KEYBOARD_GROUP_SELECTOR = Object.keys(KEYBOARD_GROUP_ITEMS).map(role => `[role=${role}]`).join(",");
