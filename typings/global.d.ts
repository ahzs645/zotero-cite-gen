declare const __env__: string;

declare const Zotero: {
  CiteGen: typeof import("../src/index").default;
  Item: new (itemType: string) => any;
  Collection: new (params?: {
    name?: string;
    libraryID?: number;
    parentID?: number;
    parentKey?: string;
  }) => any;
  Prefs: {
    get(pref: string, global?: boolean): any;
    set(pref: string, value: any, global?: boolean): void;
  };
  Items: {
    get(id: number | number[]): any;
    getAsync(ids: number[]): Promise<any[]>;
  };
  Libraries: {
    userLibraryID: number;
    getAll(): any[];
    getName(libraryID: number): string;
    getType(libraryID: number): string;
    isEditable(libraryID: number): boolean;
  };
  ItemTypes: {
    getID(typeName: string): number;
  };
  CreatorTypes: {
    getID(typeName: string): number;
    getPrimaryIDForType(itemTypeID: number): number;
  };
  Collections: {
    get(id: number): any;
    getByLibrary(libraryID: number): any[];
  };
  Search: new () => {
    libraryID: number;
    addCondition(condition: string, operator: string, value: string): void;
    search(): Promise<number[]>;
  };
  DB: {
    executeTransaction(fn: () => Promise<void>): Promise<void>;
  };
  File: {
    getContentsAsync(path: string): Promise<string>;
    putContentsAsync(path: string, data: string): Promise<void>;
  };
  HTTP: {
    request(
      method: string,
      url: string,
      options?: {
        headers?: Record<string, string>;
        body?: string;
        responseType?: string;
        timeout?: number;
      },
    ): Promise<{ status: number; responseText: string; response: any }>;
  };
  initializationPromise: Promise<void>;
  getMainWindow(): Window;
  getActiveZoteroPane(): any;
  Schema: {
    schemaUpdatePromise: Promise<void>;
  };
  Styles: {
    getVisible(): any[];
  };
  QuickCopy: {
    getContentFromItems(items: any[], format: string): { html: string; text: string };
  };
  PreferencePanes: {
    register(options: {
      pluginID: string;
      src: string;
      scripts?: string[];
      stylesheets?: string[];
    }): void;
  };
  ItemPaneManager: {
    registerSection(options: any): string | false;
    unregisterSection(id: string): void;
  };
  Reader: {
    registerEventListener(
      event: string,
      handler: (event: any) => void,
      pluginID: string,
    ): void;
    unregisterEventListener(event: string, handler: any): void;
  };
  Notifier: {
    registerObserver(
      observer: any,
      types: string[],
      id: string,
    ): string;
    unregisterObserver(id: string): void;
  };
  ProgressWindow: new () => any;
  launchURL(url: string): void;
  log(msg: string): void;
  debug(msg: string): void;
};

declare const ZoteroPane: {
  getSelectedCollection(): any;
  getSelectedItems(): any[];
};

declare const Services: {
  scriptloader: {
    loadSubScript(url: string, scope?: any): void;
  };
  prompt: any;
};

declare const Components: any;
declare const Cu: {
  unload(url: string): void;
};
declare const APP_SHUTDOWN: number;

interface Window {
  openDialog(
    url: string,
    name?: string,
    features?: string,
    ...args: any[]
  ): Window;
}

interface Document {
  createXULElement(tagName: string): any;
}
