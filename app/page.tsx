export default function Home() {
  return (
    <form
      method="post"
      action="https://listmonk.schulze.network/subscription/form"
      className="listmonk-form"
    >
      <div>
        <h3>Subscribe</h3>
        <input type="hidden" name="nonce" />
        <p>
          <input type="email" name="email" required placeholder="E-post" />
        </p>
        <p>
          <input type="text" name="name" placeholder="Namn (ej obligatorisk)" />
        </p>

        <p>
          <input
            id="c99ab"
            type="checkbox"
            name="l"
            checked
            value="c99ab65c-cd0a-4ccc-ba63-0c9f7de99ac3"
          />
          <label htmlFor="c99ab">Produktnyheter</label>
          <br />
          <span>Produktnyheter för Schulze Network</span>
        </p>

        <p>
          <input type="submit" value="Prenumerera" />
        </p>
      </div>
    </form>
  );
}
