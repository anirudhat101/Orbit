export type Session = {
  user: {
    id: string;
    email: string;
  };
};

export const auth = async (): Promise<Session> => {
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "anonymous@orbitchat",
    },
  };
};
