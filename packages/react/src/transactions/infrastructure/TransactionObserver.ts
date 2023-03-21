import {
  HasTxHashBeenIndexedDocument,
  HasTxHashBeenIndexedQuery,
  HasTxHashBeenIndexedQueryVariables,
  LensApolloClient,
  ProxyActionStatusDocument,
  ProxyActionStatusQuery,
  ProxyActionStatusQueryVariables,
  ProxyActionStatusTypes,
  TransactionErrorReasons,
} from '@lens-protocol/api-bindings';
import {
  ProxyActionStatus,
  TransactionError,
  TransactionErrorReason,
} from '@lens-protocol/domain/entities';
import { ChainType, failure, PromiseResult, Result, success } from '@lens-protocol/shared-kernel';

import { IProviderFactory } from '../../wallet/adapters/IProviderFactory';
import { IndexingEvent, ITransactionObserver, ProxyActionStatusEvent } from './TransactionFactory';

const ONE_SECOND = 1000; // ms

/**
 * The transaction observer timings
 *
 * @group Transaction Configuration
 */
export type TransactionObserverTimings = {
  pollingInterval: number; // ms // TODO delete this
  maxMiningWaitTime: number; // ms
  maxIndexingWaitTime: number; // ms
};

function delay(waitInMs: number) {
  return new Promise((resolve) => setTimeout(resolve, waitInMs));
}

function resolveTransactionErrorReason(reason: TransactionErrorReasons) {
  switch (reason) {
    case TransactionErrorReasons.Reverted:
      return TransactionErrorReason.REVERTED;
    default:
      return TransactionErrorReason.UNKNOWN;
  }
}

export class TransactionObserver implements ITransactionObserver {
  constructor(
    private readonly providerFactory: IProviderFactory,
    private readonly apolloClient: LensApolloClient,
    private readonly timings: TransactionObserverTimings,
  ) {}

  async waitForExecuted(
    txHash: string,
    chainType: ChainType,
  ): PromiseResult<void, TransactionError> {
    const provider = await this.providerFactory.createProvider({ chainType });
    const startedAt = Date.now();

    while (Date.now() - startedAt <= this.timings.maxMiningWaitTime) {
      const txResponse = await provider.getTransaction(txHash);

      if (txResponse === null) {
        await delay(ONE_SECOND);
        continue;
      }
      try {
        await Promise.race([
          txResponse.wait(1),

          delay(this.timings.maxMiningWaitTime).then(() => {
            throw new TransactionError(TransactionErrorReason.MINING_TIMEOUT);
          }),
        ]);
        return success();
      } catch (e) {
        if (e instanceof TransactionError) {
          return failure(e);
        }
        throw e;
      }
    }
    return failure(new TransactionError(TransactionErrorReason.MINING_TIMEOUT));
  }

  async waitForNextIndexingEvent(
    indexingId: string,
  ): PromiseResult<IndexingEvent, TransactionError> {
    const startedAt = Date.now();
    const observable = this.apolloClient.poll<
      HasTxHashBeenIndexedQuery,
      HasTxHashBeenIndexedQueryVariables
    >({
      query: HasTxHashBeenIndexedDocument,
      variables: {
        request: { txId: indexingId },
      },
    });
    let previousTxHash: string | null = null;

    return new Promise<Result<IndexingEvent, TransactionError>>((resolve, reject) => {
      const subscription = observable.subscribe({
        next: async ({ result }) => {
          switch (result.__typename) {
            case 'TransactionIndexedResult':
              if (previousTxHash === null) {
                previousTxHash = result.txHash;
              }

              if (previousTxHash !== result.txHash || result.indexed) {
                subscription.unsubscribe();
                resolve(
                  success({
                    indexed: result.indexed,
                    txHash: result.txHash,
                  }),
                );
                return;
              }
              break;

            case 'TransactionError':
              subscription.unsubscribe();
              resolve(failure(new TransactionError(resolveTransactionErrorReason(result.reason))));
          }

          if (Date.now() - startedAt > this.timings.maxIndexingWaitTime) {
            subscription.unsubscribe();

            resolve(failure(new TransactionError(TransactionErrorReason.INDEXING_TIMEOUT)));
          }
        },
        error: reject,
      });
    });
  }

  async waitForProxyTransactionStatus(
    proxyId: string,
  ): PromiseResult<ProxyActionStatusEvent, TransactionError> {
    const startedAt = Date.now();
    const observable = this.apolloClient.poll<
      ProxyActionStatusQuery,
      ProxyActionStatusQueryVariables
    >({
      query: ProxyActionStatusDocument,
      variables: { proxyActionId: proxyId },
    });
    let previousTxHash: string | null = null;

    return new Promise<Result<ProxyActionStatusEvent, TransactionError>>((resolve, reject) => {
      const subscription = observable.subscribe({
        next: async ({ result }) => {
          switch (result.__typename) {
            case 'ProxyActionStatusResult':
              if (previousTxHash === null) {
                previousTxHash = result.txHash;
              }

              if (
                previousTxHash !== result.txHash ||
                result.status === ProxyActionStatusTypes.Complete
              ) {
                subscription.unsubscribe();
                resolve(
                  success({
                    txHash: result.txHash,
                    status: ProxyActionStatus.COMPLETE,
                  }),
                );
                return;
              }
              break;

            case 'ProxyActionError':
              subscription.unsubscribe();
              resolve(failure(new TransactionError(TransactionErrorReason.UNKNOWN)));
          }

          // handle timeout as the last possible case, otherwise can fail with timeout on Complete tx
          if (Date.now() - startedAt > this.timings.maxIndexingWaitTime) {
            subscription.unsubscribe();

            resolve(failure(new TransactionError(TransactionErrorReason.INDEXING_TIMEOUT)));
          }
        },
        error: reject,
      });
    });
  }
}
