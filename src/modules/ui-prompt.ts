export function openPromptDialog(rootURI: string) {
  const mainWin = Zotero.getMainWindow();

  mainWin.openDialog(
    rootURI + "content/prompt-dialog.xhtml",
    "citegen-prompt",
    "chrome,centerscreen,resizable,dialog=no,width=650,height=520",
  );
}
