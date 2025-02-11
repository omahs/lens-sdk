import { OperationVariables } from '@apollo/client';
import { createSnapshotApolloClient, SafeApolloClient, Sources } from '@lens-protocol/api-bindings';
import { ProfileId } from '@lens-protocol/domain/entities';
import { Overwrite, Prettify } from '@lens-protocol/shared-kernel';
import { useState } from 'react';

import { useActiveProfileIdentifier } from '../profile/useActiveProfileIdentifier';
import { useSharedDependencies } from '../shared';

export type UseApolloClientResult<TOptions> = TOptions & {
  client: SafeApolloClient;
};

export function useLensApolloClient<TOptions>(
  args: TOptions = {} as TOptions,
): UseApolloClientResult<TOptions> {
  const { apolloClient: client } = useSharedDependencies();

  return {
    ...args,
    client,
  };
}

export function useSnapshotApolloClient<TOptions>(
  args: TOptions = {} as TOptions,
): UseApolloClientResult<TOptions> {
  const { environment } = useSharedDependencies();

  const [client] = useState(() =>
    createSnapshotApolloClient({
      backendURL: environment.snapshot.hub,
    }),
  );

  return {
    ...args,
    client,
  };
}

export type WithObserverIdOverride<TVariables = unknown> = Prettify<
  TVariables & {
    /**
     * The ID of the profile that is observing the data.
     *
     * @defaultValue The ID of the Active Profile if it exists, otherwise `null`
     */
    observerId?: ProfileId;
  }
>;

export type UseActiveProfileAsDefaultObserverArgs<TVariables> = {
  skip?: boolean;
  variables: WithObserverIdOverride<TVariables>;
};

export type UseActiveProfileAsDefaultObserverResultVariables<TVariables> = TVariables & {
  observerId: ProfileId | null;
};

export type UseActiveProfileAsDefaultObserverResult<TVariables> = Prettify<
  Overwrite<
    UseActiveProfileAsDefaultObserverArgs<TVariables>,
    {
      variables: UseActiveProfileAsDefaultObserverResultVariables<TVariables>;
      skip: boolean;
    }
  >
>;

export function useActiveProfileAsDefaultObserver<TVariables>({
  skip,
  variables,
  ...others
}: UseActiveProfileAsDefaultObserverArgs<TVariables>): UseActiveProfileAsDefaultObserverResult<TVariables> {
  const { data: activeProfile, loading: bootstrapping } = useActiveProfileIdentifier();

  return {
    ...others,
    variables: {
      ...variables,
      observerId: variables.observerId ?? activeProfile?.id ?? null,
    },
    skip: skip || bootstrapping,
  };
}

export type UseSourcesFromConfigResult<TVariables extends OperationVariables> = TVariables & {
  sources: Sources;
};

export function useSourcesFromConfig<TVariables extends OperationVariables>(
  variables: TVariables,
): UseSourcesFromConfigResult<TVariables> {
  const { sources } = useSharedDependencies();

  return {
    ...variables,
    sources,
  };
}
