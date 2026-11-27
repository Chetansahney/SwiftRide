import { Fragment } from 'react';

// Puts elements (usually links) into a translated sentence, so word order can
// differ by language: "I agree to the {terms}" / "मैं {terms} से सहमत हूँ".
export default function LinkedText({ text, parts }) {
    return (
        <>
            {String(text)
                .split(/(\{\w+\})/)
                .map((piece, index) => {
                    const name = piece.match(/^\{(\w+)\}$/)?.[1];
                    return <Fragment key={index}>{name && parts[name] ? parts[name] : piece}</Fragment>;
                })}
        </>
    );
}
