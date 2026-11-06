declare module "autocannon" {
  interface RequestOptions {
    body?: string;
    [key: string]: unknown;
  }

  interface Options {
    url: string;
    method?: string;
    connections?: number;
    amount?: number;
    headers?: Record<string, string>;
    requests?: Array<{
      setupRequest?: (request: RequestOptions) => RequestOptions;
    }>;
  }

  interface Result {
    [key: string]: unknown;
  }

  function autocannon(
    options: Options,
    callback: (error: Error | null, result: Result) => void
  ): void;

  namespace autocannon {
    function printResult(result: Result): string;
  }

  export = autocannon;
}
