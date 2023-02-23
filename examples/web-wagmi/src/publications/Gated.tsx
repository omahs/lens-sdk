import { useEncryptGatedPublication } from '@lens-protocol/react';
import { Wallet } from 'ethers';
import { FormEvent } from 'react';

export function Gated() {
  const encrypt = useEncryptGatedPublication(Wallet.createRandom());

  async function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const value = formData.get('value') as string;
    const encrypted = await encrypt(value);
    console.log(encrypted);
  }

  return (
    <form onSubmit={connect}>
      <input type="text" value="Lens Protocol" name="value" />
      <button>Encrypt</button>
    </form>
  );
}
