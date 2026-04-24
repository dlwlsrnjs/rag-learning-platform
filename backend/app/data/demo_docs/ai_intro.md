# A Short Introduction to AI

Artificial Intelligence (AI) is the field of building systems that perform
tasks that would normally require human intelligence: recognizing images,
understanding language, planning actions, and making predictions.

## Machine Learning

Most modern AI is built on *machine learning* — instead of hand-writing
rules, we show a model many examples and let it learn the rules statistically.
A model is defined by its parameters, and training adjusts those parameters
so the model's outputs match the examples.

## Neural Networks

Neural networks are layered functions made of simple units (neurons). Deep
learning refers to neural networks with many layers. Transformers, the
architecture behind models like GPT, process sequences by letting each
position attend to every other position.

## Large Language Models

A large language model (LLM) is a transformer trained on vast amounts of
text to predict the next token. By predicting tokens well, an LLM ends up
encoding grammar, facts, and reasoning patterns — enough to follow
instructions, write code, and summarize documents.

## Limits

LLMs can sound confident while being wrong. They have no memory across
conversations unless the system stores and replays it. And their knowledge
is frozen at training time, which is why retrieval — feeding them fresh
documents at query time — matters so much.
