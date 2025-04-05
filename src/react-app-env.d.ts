/// <reference types="react-scripts" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly REACT_APP_ANTHROPIC_API_KEY: string;
    readonly REACT_APP_ANTHROPIC_MODEL: string;
    readonly REACT_APP_ANTHROPIC_VERSION: string;
  }
}
