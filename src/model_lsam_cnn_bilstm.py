"""
LSAM-CNN-BiLSTM model.

LSAM = Lightweight Subspace Attention Module (ULSAM, Saini et al., WACV 2020),
adapted to 1D feature sequences.

ULSAM idea (per subspace):
  1. split the feature channels into G subspaces (groups).
  2. for each subspace: a depthwise conv + pointwise conv -> a single-channel
     attention map, softmax'd over the sequence (spatial) axis.
  3. reweight the subspace by that map and add a residual.
  4. concatenate the subspaces back.
It is "lightweight" because attention is computed per small subspace with tiny
depthwise/pointwise convs (very few parameters).

Pipeline:  Conv1D blocks -> LSAM -> BiLSTM -> GAP -> softmax.
Input = FFT magnitude (bins, channels) e.g. (257,3); same leakage-safe pipeline.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import (Input, Conv1D, DepthwiseConv1D, BatchNormalization,
                                      MaxPooling1D, Bidirectional, LSTM, Dense, Dropout,
                                      Multiply, Add, Softmax, Concatenate, Lambda,
                                      GlobalAveragePooling1D)
from tensorflow.keras.regularizers import l2


def _ulsam_subspace(xg):
    """One subspace: depthwise -> pointwise 1-ch map -> softmax(time) -> reweight+residual."""
    dw = DepthwiseConv1D(3, padding="same")(xg)      # local depthwise features
    att = Conv1D(1, 1, padding="same")(dw)           # -> single-channel map (T,1)
    att = Softmax(axis=1)(att)                        # attention over the sequence
    return Add()([Multiply()([xg, att]), xg])        # reweight + residual


def lsam(x, groups=4):
    """Lightweight Subspace Attention Module over channel subspaces."""
    ch = x.shape[-1]
    if ch % groups != 0:
        groups = 1
    sub = ch // groups
    parts = []
    for i in range(groups):
        xg = x[:, :, i * sub:(i + 1) * sub]       # serializable slice (no Lambda)
        parts.append(_ulsam_subspace(xg))
    return Concatenate()(parts) if groups > 1 else parts[0]


def build_model(input_len=None, n_channels=3, n_classes=5, lr=None):
    input_len = input_len or C.WINDOW
    lr = lr or C.LR
    wd = 1e-3
    inp = Input(shape=(input_len, n_channels))

    # ---- CNN feature extractor ----
    x = Conv1D(16, 16, padding="same", activation="relu", kernel_regularizer=l2(wd))(inp)
    x = BatchNormalization()(x); x = MaxPooling1D(2)(x)
    x = Conv1D(32, 8, padding="same", activation="relu", kernel_regularizer=l2(wd))(x)
    x = BatchNormalization()(x); x = MaxPooling1D(2)(x)
    x = Conv1D(64, 4, padding="same", activation="relu", kernel_regularizer=l2(wd))(x)
    x = BatchNormalization()(x); x = MaxPooling1D(2)(x)      # (bins/8, 64)

    # ---- LSAM (lightweight subspace attention) ----
    x = lsam(x, groups=4)

    # ---- BiLSTM temporal context ----
    x = Bidirectional(LSTM(32, return_sequences=True))(x)

    # ---- pool + classify ----
    g = GlobalAveragePooling1D(name="feat")(x)
    g = Dropout(0.5)(g)
    out = Dense(n_classes, activation="softmax", name="out")(g)

    model = Model(inp, out)
    model.compile(optimizer=tf.keras.optimizers.Adam(lr),
                  loss="categorical_crossentropy", metrics=["accuracy"])
    return model


if __name__ == "__main__":
    build_model(input_len=257, n_channels=3).summary()
