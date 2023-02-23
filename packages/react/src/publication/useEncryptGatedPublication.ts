import { GatedContent } from '@lens-protocol/gated-content';
import { Wallet } from 'ethers';

export function useEncryptGatedPublication(wallet: Wallet) {
  const gatedContent = new GatedContent();

  return async (value: string) => {
    await gatedContent.connect(wallet);
    return gatedContent.encrypt(value);
  };
}
