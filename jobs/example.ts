export type InngestEvent = {
  name: string;
  data?: Record<string, unknown>;
};

export type JobHandler = (event: InngestEvent) => Promise<void>;

export const exampleJob: JobHandler = async (event) => {
  console.log('Example job received:', event.name);
};


