export function openImportDialog(rootURI: string) {
  const mainWin = Zotero.getMainWindow();

  mainWin.openDialog(
    rootURI + "content/import-dialog.xhtml",
    "citegen-import",
    "chrome,centerscreen,resizable,dialog=no,width=900,height=680",
  );
}
